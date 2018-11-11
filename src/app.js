const osc = require('osc');
const net = require('net');
import { ApolloServer, gql, PubSub } from 'apollo-server';
import {CasparCG} from 'casparcg-connection';

//Setup PubSub:
const pubsub = new PubSub();
const PUBSUB_SERVER_ONLINE = 'SERVER_ONLINE';



//Setup Data Structure Interface:
var ccgNumberOfChannels = 4;
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

// Assign values to ccgChannel
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
        const casparLogHost = "localhost";
        const casparLogPort = 3250;
        const casparLogClient = new net.Socket();
        var intervalConnect;

        this.connectLog(casparLogPort, casparLogHost, casparLogClient);

        casparLogClient.on('error', (error) => {
            console.log("WARNING: LOAD and LOADBG commands will not update state as the");
            console.log("CasparCG server is offline or TCP log is not enabled in config", error);
            console.log('casparcg tcp log should be set to IP: ' + casparLogHost + " Port : " + casparLogPort);
            intervalConnect = setTimeout(() => this.connectLog(casparLogPort, casparLogHost, casparLogClient), 5000);
        });

        casparLogClient.on('data', (data) => {
            console.log("New LOG line: ", data);
            if (data.includes("LOADBG ") || data.includes("LOAD ") || data.includes("PLAY ")) {
                this.updateAcmpData();
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

    /* For use if INFO becomes deprecated like en 2.2beta
    readCasparLog(data, commandName, varName) {
        var amcpCommand = data.substr(data.indexOf(commandName));
        var amcpChannel = parseInt(amcpCommand.substr(amcpCommand.indexOf(" ")+1, amcpCommand.indexOf("-")-1));
        var amcpLayer = parseInt(amcpCommand.substr(amcpCommand.indexOf("-")+1, 2));
        var nameStart = amcpCommand.indexOf('"', 1);
        var nameEnd = amcpCommand.indexOf('"', nameStart + 1);
        ccgChannel[amcpChannel-1].layer[amcpLayer-1][varName].name = amcpCommand.substr(nameStart + 1, nameEnd - nameStart - 1);
        console.log(ccgChannel[amcpChannel-1].layer[amcpLayer-1][varName].name);
    }
    */

    setupAcmpConnection() {
        this.ccgConnection = new CasparCG(
            {
            host: "localhost",
            port: 5250,
            autoConnect: false,
        });
        this.ccgConnection.connect();
        this.ccgConnection.version()
        .then((response) => {
            ccgStatus.serverOnline = true;
            ccgStatus.version = response.response.data;
        });
    }

    updateAcmpData() {
        for (let channel = 1; channel <= ccgNumberOfChannels; channel++) {
            this.ccgConnection.info(channel,10)
            .then((response) => {
                ccgChannel[channel-1].layer[ccgDefaultLayer-1].foreground.name = response.response.data.foreground.producer.filename;
                ccgChannel[channel-1].layer[ccgDefaultLayer-1].background.name = response.response.data.background.producer.filename;
                ccgStatus.serverOnline = true;
            })
            .catch((error) => {
                ccgStatus.serverOnline = false;
                console.log(error);
            });
        }

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
                    if (message.address.includes('/file/path')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                    }
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
        const port = 5254;

        //Query schema for GraphQL:
        const typeDefs = gql `
        type Subscription {
            serverOnline: Boolean
        },
        type Query {
            serverOnline: Boolean
            serverVersion: String
            allChannels: String
            channel(ch: Int!): String
            layer(ch: Int!, l: Int!): String
            timeLeft(ch: Int!, l: Int!): String
        }
        `;


        // GraphQL resolver
        const resolvers = {
            Subscription: {
                serverOnline: {
                    // Additional event labels can be passed to asyncIterator creation
                    subscribe: () => pubsub.asyncIterator([PUBSUB_SERVER_ONLINE]),
                },
            },
            Query: {
                allChannels: () => {
                    const ccgString = JSON.stringify(ccgChannel);
                    return ccgString;
                },
                channel: (obj, args, context, info) => {
                    const ccgChString = JSON.stringify(ccgChannel[args.ch-1]);
                    return ccgChString;
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
            }
        };
        const server = new ApolloServer({
            typeDefs,
            resolvers
        });

        server.listen(port, () => console.log(`GraphQl listening on port ${port}${server.graphqlPath}`));
    }
}
