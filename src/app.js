const osc = require('osc');
const net = require('net');
const fs = require('fs');
var convert = require('xml-js');
import { ApolloServer, gql, PubSub } from 'apollo-server';
import { CasparCG } from 'casparcg-connection';

// Generics:
const CCG_HOST = "localhost";
const CCG_LOG_PORT = 3250;
const CCG_AMCP_PORT = 5250;

//Setup PubSub:
const pubsub = new PubSub();
const PUBSUB_SERVER_ONLINE = 'SERVER_ONLINE';
const PUBSUB_INFO_UPDATED = 'INFO_UPDATED';
const PUBSUB_CHANNELS_UPDATED = 'CHANNELS_UPDATED';

//Read casparcg settingsfile (place a copy of it in this folder if not installed in server folder)
var data = fs.readFileSync( 'casparcg.config');
if (configFile === "") {
    data = "<channel></channel>";
}
var configFile = convert.xml2js(data, {
    ignoreComment: true,
    alwaysChildren: true,
    compact: true
});
console.log("casparcg.config file ->", configFile);


//Setup Data Structure Interface:
var ccgNumberOfChannels = configFile.configuration.channels.channel.length || 1;
var ccgNumberOfLayers = 30;
var ccgDefaultLayer = 10;
var ccgStatus = {
    serverOnline: false,
    serverVersion: ""
};
var ccgChannel = [];
var obj = {
        "foreground": {
            "name": "",
            "path": "",
            "time": 0,
            "length": 0,
            "loop": false,
            "paused": true
        },
        "background": {
            "name": "",
            "path": "",
            "time": 0,
            "length": 0,
            "loop": false,
            "paused": true
        }
};

// Assign empty values to ccgChannel object
var ch;
var l;
var layers = [];
for (ch=0; ch<ccgNumberOfChannels; ch++) {
    for (l=0; l<ccgNumberOfLayers; l++) {
        layers[l] = JSON.parse(JSON.stringify(obj));
    }
    ccgChannel[ch] = ccgChannel[ch] = JSON.parse(JSON.stringify({ "layer" : layers }));
}

export class App {
    constructor() {
        this.playing = false;
        this.connectLog = this.connectLog.bind(this);
        this.setupOscServer();
        this.setupGraphQlExpressServer();

        //ACMP connection is neccesary, as OSC for now, does not recieve info regarding non-playing files.
        this.setupAcmpConnection();
        this.setupCasparTcpLogServer();
    }

    setupCasparTcpLogServer() {
        //Setup TCP errorlog reciever:
        const casparLogClient = new net.Socket();

        this.connectLog(CCG_LOG_PORT, CCG_HOST, casparLogClient);

        casparLogClient.on('error', (error) => {
            console.log("WARNING: LOAD and LOADBG commands will not update state as the");
            console.log("CasparCG server is offline or TCP log is not enabled in config", error);
            console.log('casparcg tcp log should be set to IP: ' + CCG_HOST + " Port : " + CCG_LOG_PORT);
            ccgStatus.serverOnline = false;
            var intervalConnect = setTimeout(() => this.connectLog(CCG_LOG_PORT, CCG_HOST, casparLogClient), 5000);
        });

        casparLogClient.on('data', (data) => {
            console.log("New LOG line: ", data.toString());
            if (data.includes("LOADBG ") || data.includes("LOAD ") || data.includes("PLAY ")) {
                this.updateAcmpData()
                .then(() => {
                var channel = this.readLogChannel(data.toString(), "LOAD");
                    if ( channel > 0) {
                        pubsub.publish(PUBSUB_INFO_UPDATED, { infoChannelUpdated: channel });
                        pubsub.publish(PUBSUB_CHANNELS_UPDATED, { channels: ccgChannel });
                    }
                });
            }
        });
    }

    connectLog(port, host, client) {
        client.connect(port, host, () => {
            console.log('CasparLogClient connected to: ' + host + ':' + port);
            ccgStatus.serverOnline = true;
        });
        pubsub.publish(PUBSUB_SERVER_ONLINE, { serverOnline: ccgStatus.serverOnline});
    }


    readLogChannel(data, commandName, varName) {
        var amcpCommand = data.substr(data.indexOf(commandName));
        var amcpChannel = parseInt(amcpCommand.substr(amcpCommand.indexOf(" ")+1, amcpCommand.indexOf("-")-1));
        var amcpLayer = parseInt(amcpCommand.substr(amcpCommand.indexOf("-")+1, 2));
        var nameStart = amcpCommand.indexOf('"', 1);
        var nameEnd = amcpCommand.indexOf('"', nameStart + 1);
        //ccgChannel[amcpChannel-1].layer[amcpLayer-1][varName].name = amcpCommand.substr(nameStart + 1, nameEnd - nameStart - 1);
        //console.log(ccgChannel[amcpChannel-1].layer[amcpLayer-1][varName].name);
        return amcpChannel;
    }

    setupAcmpConnection() {
        this.ccgConnection = new CasparCG(
            {
            host: CCG_HOST,
            port: CCG_AMCP_PORT,
            autoConnect: false,
        });
        this.ccgConnection.connect();
        this.ccgConnection.version()
        .then((response) => {
            ccgStatus.version = response.response.data;
        });
    }

    updateAcmpData() {
        return new Promise((resolve, reject) => {
            for (let channel = 1; channel <= ccgNumberOfChannels; channel++) {
                this.ccgConnection.info(channel,10)
                .then((response) => {
                    ccgChannel[channel-1].layer[ccgDefaultLayer-1].foreground.name = this.extractFilenameFromPath(response.response.data.foreground.producer.filename);
                    ccgChannel[channel-1].layer[ccgDefaultLayer-1].background.name = this.extractFilenameFromPath(response.response.data.background.producer.filename);
                    ccgChannel[channel-1].layer[ccgDefaultLayer-1].foreground.path = response.response.data.foreground.producer.filename;
                    ccgChannel[channel-1].layer[ccgDefaultLayer-1].background.path = response.response.data.background.producer.filename;
                })
                .catch((error) => {
                    console.log(error);
                    reject(false);
                });
            }
            resolve(true);
        });
    }

    extractFilenameFromPath(filename) {
        return filename.replace(/^.*[\\\/]/, '');
    }

    timeoutPromise(ms, promise) {
        return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error("Offline: Server was to long to respond"));
        }, ms);
        promise.then(resolve, reject);
        });
    }


    setupOscServer() {
        var getIPAddresses = function () {
            var os = require("os"),
                interfaces = os.networkInterfaces(),
                ipAddresses = [];

            for (var deviceName in interfaces) {
                var addresses = interfaces[deviceName];
                for (var i = 0; i < addresses.length; i++) {
                    var addressInfo = addresses[i];
                    if (addressInfo.family === "IPv4" && !addressInfo.internal) {
                        ipAddresses.push(addressInfo.address);
                    }
                }
            }

            return ipAddresses;
        };
        const oscConnection = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: 5253
        });

        oscConnection.on("ready", function () {
            var ipAddresses = getIPAddresses();

            console.log("Listening for OSC over UDP.");
            ipAddresses.forEach(function (address) {
                console.log(" Host:", address + ", Port:", oscConnection.options.localPort);
            });
        });

        oscConnection.on('message', (message) => {
            var channelIndex = this.findChannelNumber(message.address)-1;
            var layerIndex = this.findLayerNumber(message.address)-1;
            if (message.address.includes('/stage/layer')) {
                //Handle foreground messages:
                    if (message.address.includes('file/time')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args[1];
                    }
                    if (message.address.includes('loop')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
                    }
                    if (message.address.includes('/paused')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
                    }
            }
        });

        oscConnection.open();
        console.log(`OSC listening on port 5253`);

    }

    findChannelNumber(string) {
        var channel = string.replace("/channel/", "");
        channel = channel.slice(0, (channel.indexOf("/")));
        return channel;
    }

    findLayerNumber(string) {
        var channel = string.slice(string.indexOf('layer/')+6);
        channel = channel.slice(0, (channel.indexOf("/")));
        return channel;
    }


    setupGraphQlExpressServer() {
        const graphQlPort = 5254;

        //Query schema for GraphQL:
        const typeDefs = gql `
        type Subscription {
            infoChannelUpdated: String
            channels: [Channels]
        },
        type Query {
            serverOnline: Boolean
            serverVersion: String
            channels: [Channels]
            layer(ch: Int!, l: Int!): String
            timeLeft(ch: Int!, l: Int!): String
        },
        type Channels {
            layers: [Layers]
        },
        type Layers {
            foreground: Foreground
            background: Background
        },
        type Foreground {
            name: String
            path: String
            length: Float
            loop: Boolean
            paused: Boolean
        }
        type Background {
            name: String
            path: String
            length: Float
            loop: Boolean
        }
        `;


        // GraphQL resolver
        const resolvers = {
            Subscription: {
                infoChannelUpdated: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_INFO_UPDATED])
                },
                channels: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_CHANNELS_UPDATED])
                }
            },
            Query: {
                channels: () => {
                    return ccgChannel;
                },
                layer: (obj, args, context, info) => {
                    const ccgLayerString = JSON.stringify(ccgChannel[args.ch-1].layer[args.l-1]);
                    return ccgLayerString;
                },
                timeLeft: (obj, args, context, info) => {
                    return (ccgChannel[args.ch-1].layer[args.l-1].foreground.length - ccgChannel[args.ch-1].layer[args.l-1].foreground.time);
                },
                serverOnline: () => {
                    return ccgStatus.serverOnline;
                }
            },
            Channels: {
                layers: (root) => root.layer
            },
            Layers: {
                foreground: (root) => root.foreground,
                background: (root) => root.background
            },
            Foreground: {
                name: (root) => { return root.name; },
                path: (root) => { return root.path; },
                length: (root) => { return root.length; },
                loop: (root) => { return root.loop; },
                paused: (root) => { return root.paused; }
            },
            Background: {
                name: (root) => { return root.name; },
                path: (root) => { return root.path; },
                length: (root) => { return root.length; },
                loop: (root) => { return root.loop; }
            }
        };
        const server = new ApolloServer({
            typeDefs,
            resolvers
        });

        server.listen(graphQlPort, () => console.log(`GraphQl listening on port ${graphQlPort}${server.graphqlPath}`));
    }
}
