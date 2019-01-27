const osc = require('osc');
const net = require('net');
const fs = require('fs');
const chokidar = require('chokidar');

var convert = require('xml-js');
import { ApolloServer, gql, PubSub } from 'apollo-server';
import { CasparCG } from 'casparcg-connection';

//Utils:
import {cleanUpFilename, extractFilenameFromPath} from './utils/filePathStringHandling';
import {findLayerNumber, findChannelNumber} from './utils/oscStringHandling';

// Generics:
const CCG_HOST = "localhost";
const CCG_LOG_PORT = 3250;
const CCG_AMCP_PORT = 5250;
const CCG_DEFAULT_LAYER = 10;
const CCG_NUMBER_OF_LAYERS = 30;

//Setup PubSub:
const pubsub = new PubSub();
const PUBSUB_INFO_UPDATED = 'INFO_UPDATED';
const PUBSUB_CHANNELS_UPDATED = 'CHANNELS_UPDATED';
const PUBSUB_PLAY_LAYER_UPDATED = 'PLAY_LAYER';
const PUBSUB_TIMELEFT_UPDATED = 'TIMELEFT_UPDATED';
const PUBSUB_MEDIA_FILE_CHANGED = 'MEDIA_FILE_CHANGED';

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
var ccgStatus = {
    serverOnline: false,
    serverVersion: ""
};
var ccgChannel = [];
var obj = {
        "foreground": {
            "name": "",
            "path": "",
            "time": 0.0,
            "length": 0.0,
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
    for (l=0; l<CCG_NUMBER_OF_LAYERS; l++) {
        layers[l] = JSON.parse(JSON.stringify(obj));
    }
    ccgChannel[ch] = ccgChannel[ch] = JSON.parse(JSON.stringify({ "layer" : layers }));
}

export class App {
    constructor() {
        this.connectLog = this.connectLog.bind(this);
        this.pulishInfoUpdate = this.pulishInfoUpdate.bind(this);
        this.setupOscServer();
        this.setupGraphQlExpressServer();
        this.fileWatchSetup(configFile.configuration.paths['thumbnail-path']._text);

        //ACMP connection is neccesary, as OSC for now, does not recieve info regarding non-playing files.
        //TCP Log is used for triggering fetch of AMCP INFO
        if (ccgStatus.version < "2.2") {
            this.setupAcmpConnection();
            this.setupCasparTcpLogServer();
        }
        var timeLeftSubscription = setInterval(() => {
            pubsub.publish(PUBSUB_TIMELEFT_UPDATED, { timeLeft: ccgChannel });
        },
        40);
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
                this.updateAcmpData(1)
                .then(() => {
                var channel = this.readLogChannel(data.toString(), "LOAD");
                    if ( channel > 0) {
                        this.pulishInfoUpdate(channel);
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
    }

    readLogChannel(data, commandName, varName) {
        var amcpCommand = data.substr(data.indexOf(commandName));
        var amcpChannel = parseInt(amcpCommand.substr(amcpCommand.indexOf(" ")+1, amcpCommand.indexOf("-")-1));
        var amcpLayer = parseInt(amcpCommand.substr(amcpCommand.indexOf("-")+1, 2));
        var nameStart = amcpCommand.indexOf('"', 1);
        var nameEnd = amcpCommand.indexOf('"', nameStart + 1);
        return amcpChannel;
    }

    //Follow media directories and pubsub if changes occour:
    fileWatchSetup(folder) {
        chokidar.watch(folder,
            {ignored: /(^|[\/\\])\../})
            .on('all', (event, path) => {
                setTimeout(() => {
                    pubsub.publish(PUBSUB_MEDIA_FILE_CHANGED, { mediaFilesChanged: true });
                    console.log("File/Folder Changes :" ,event, path);
                }, 10);
            })
            .on('ready', (event, path) => {
                console.log("File/Folder Watch Ready ");
            })
            .on('error', (event,path) => {
                console.log("File/Foler Watch Error:",event, path);
            })
            ;
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
            console.log("ACMP connection established to: ", CCG_HOST, ":", CCG_AMCP_PORT);
            console.log("CasparCG Server Version :", response.response.data);
            ccgStatus.version = response.response.data;
        });
    }

    updateAcmpData(channel) {
        return new Promise((resolve, reject) => {
            if (channel > ccgNumberOfChannels) {
                resolve(true);
            }
            this.ccgConnection.info(channel,CCG_DEFAULT_LAYER)
            .then((response) => {
                ccgChannel[channel-1].layer[CCG_DEFAULT_LAYER-1].foreground.name = extractFilenameFromPath(response.response.data.foreground.producer.filename);
                ccgChannel[channel-1].layer[CCG_DEFAULT_LAYER-1].background.name = extractFilenameFromPath(response.response.data.background.producer.filename || "");
                ccgChannel[channel-1].layer[CCG_DEFAULT_LAYER-1].foreground.path = cleanUpFilename(response.response.data.foreground.producer.filename);
                ccgChannel[channel-1].layer[CCG_DEFAULT_LAYER-1].background.path = cleanUpFilename(response.response.data.background.producer.filename || "");

                this.updateAcmpData(channel + 1)
                .then(() => {
                    resolve(true);
                });
            })
            .catch((error) => {
                console.log(error);
                reject(false);
            });
        });
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
            let channelIndex = findChannelNumber(message.address)-1;
            let layerIndex = findLayerNumber(message.address)-1;

            if (message.address.includes('/stage/layer')) {
                //CCG 2.1 Handle OSC /file/path:
                if (message.address.includes('file/path') && ccgStatus.version < "2.2") {
                    if (ccgChannel[channelIndex].layer[layerIndex].foreground.name != message.args[0]) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                        this.pulishInfoUpdate(channelIndex);
                    }
                }
                //CCG 2.2 Handle OSC /file/path:
                if (message.address.includes('foreground/file/path')) {
                    if (ccgChannel[channelIndex].layer[layerIndex].foreground.path != message.args[0]) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];

                        this.pulishInfoUpdate(channelIndex);
                    }
                }
                if (message.address.includes('background/file/path')) {
                    if (ccgChannel[channelIndex].layer[layerIndex].background.path != message.args[0]) {
                        ccgChannel[channelIndex].layer[layerIndex].background.path = message.args[0];

                        this.pulishInfoUpdate(channelIndex);
                    }
                }
                if (message.address.includes('foreground/file/name')) {
                    ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                }
                if (message.address.includes('background/file/name')) {
                    ccgChannel[channelIndex].layer[layerIndex].background.name = message.args[0];
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

    pulishInfoUpdate(channelIndex) {
        let ccgPlayLayer = [];

        for (let i=0; i<ccgNumberOfChannels; i++) {
            ccgPlayLayer.push({ "layer" : [] });
            ccgPlayLayer[i].layer.push(ccgChannel[i].layer[CCG_DEFAULT_LAYER-1]);
        }
        console.log("OSC FILENAME:", message.args[0]);
        pubsub.publish(PUBSUB_PLAY_LAYER_UPDATED, { playLayer: ccgPlayLayer });
        pubsub.publish(PUBSUB_INFO_UPDATED, { infoChannelUpdated: channelIndex });
        pubsub.publish(PUBSUB_CHANNELS_UPDATED, { channels: ccgChannel });
    }

    setupGraphQlExpressServer() {
        const graphQlPort = 5254;

        //Query schema for GraphQL:
        const typeDefs = gql `
        type Subscription {
            channels: [Channels]
            playLayer : [Channels]
            infoChannelUpdated: String
            timeLeft: [Timeleft]
            mediaFilesChanged: Boolean
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
        type Timeleft {
            timeLeft: Float
            time: Float
        }
        `;


        // GraphQL resolver
        const resolvers = {
            Subscription: {
                channels: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_CHANNELS_UPDATED]),
                },
                playLayer: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_PLAY_LAYER_UPDATED]),
                },
                infoChannelUpdated: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_INFO_UPDATED]),
                },
                timeLeft: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_TIMELEFT_UPDATED]),
                },
                mediaFilesChanged: {
                    subscribe: () => pubsub.asyncIterator([PUBSUB_MEDIA_FILE_CHANGED]),
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
            },
            Timeleft: {
                timeLeft: (root) => {
                    return root.layer[CCG_DEFAULT_LAYER-1].foreground.length - root.layer[CCG_DEFAULT_LAYER-1].foreground.time;
                },
                time: (root) => { return root.layer[CCG_DEFAULT_LAYER-1].foreground.time; }
            }
        };
        const server = new ApolloServer({
            typeDefs,
            resolvers
        });

        server.listen(graphQlPort, () => console.log(`GraphQl listening on port ${graphQlPort}${server.graphqlPath}`));
    }
}
