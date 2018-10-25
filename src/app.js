const osc = require('osc');
const express = require('express');
const graphqlHTTP = require('express-graphql');
const { buildSchema } = require('graphql');
//For casparTCPLog but not in use as CCG2.2 does not support it:
const net = require('net');
import {CasparCG} from 'casparcg-connection';


//Query schema for GraphQL:
var apiSchema = buildSchema(`
    type Query {
        allChannels: String
        channel(ch: Int!): String
        layer(ch: Int!, l: Int!): String
        timeLeft(ch: Int!, l: Int!): String
    }
`);

//Setup Interface:
var ccgNumberOfChannels = 4;
var ccgNumberOfLayers = 30;
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
        const _this = this;

        this.setupOscServer();
        //this.setupCasparTcpLogServer();
        this.setupExpressServer();
        this.setupAcmpConnection();

    }

    setupAcmpConnection() {
        // in current version of casparcg-connection the port has to be assigned as a seperate parameter.
        this.ccgConnection = new CasparCG(
            {
            host: "localhost",
            port: 5250,
            autoConnect: false,
        });
        this.ccgConnection.connect();
        var connectionTimer = setInterval(() => this.updateAcmpData(), 3000);
    }

    updateAcmpData() {
        var channel = 1;
        var layer = 10;
        this.ccgConnection.info(channel,10)
        .then((response) => {
            ccgChannel[channel-1].layer[layer-1].foreground.name = response.response.data.foreground.producer.filename;
            ccgChannel[channel-1].layer[layer-1].background.name = response.response.data.background.producer.filename;
            console.log(response.response.data);
        });
        this.timeoutPromise(1000, this.ccgConnection.version())
        .then ((response) => {
            console.log("Server Online - version:", response.response.data);
        })
        .catch((error) =>{
            console.log(error);
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


    setupCasparTcpLogServer() {
        //Setup TCP errorlog reciever:
        const casparLogHost = "localhost";
        const casparLogPort = 3250;
        const casparLogClient = new net.Socket();

        casparLogClient.connect(casparLogPort, casparLogHost, () => {
            console.log('CasparLogClient connected to: ' + casparLogHost + ':' + casparLogPort);
        });

        casparLogClient.on('data', (data) => {
            console.log("New LOG line: ", data);
            if (data.includes("LOADBG ")) {
                this.readCasparLog(data ,"LOADBG", "background");
            }
            if (data.includes("LOAD ")) {
                this.readCasparLog(data ,"LOAD", "foreground");
            }
        });
    }

    readCasparLog(data, commandName, varName) {
        var amcpCommand = data.substr(data.indexOf(commandName));
        var amcpChannel = parseInt(amcpCommand.substr(amcpCommand.indexOf(" ")+1, amcpCommand.indexOf("-")-1));
        var amcpLayer = parseInt(amcpCommand.substr(amcpCommand.indexOf("-")+1, 2));
        var nameStart = amcpCommand.indexOf('"', 1);
        var nameEnd = amcpCommand.indexOf('"', nameStart + 1);
        ccgChannel[amcpChannel-1].layer[amcpLayer-1][varName].name = amcpCommand.substr(nameStart + 1, nameEnd - nameStart - 1);
        console.log(ccgChannel[amcpChannel-1].layer[amcpLayer-1][varName].name);
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
            if (channel > 0) {
                //Handle foreground messages:
                if (message.address.includes('/foreground/')) {
                    if (message.address.includes('/filename')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                    }
                    if (message.address.includes('/file-frame-number')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args;
                    }
                    if (message.address.includes('/file-nb-frames')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args;
                    }
                    if (message.address.includes('/loop')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
                    }
                    if (message.address.includes('/paused')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
                    }
                }
                //Handle background messages:
                if (message.address.includes('/background/')) {
                    if (message.address.includes('/filename')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                    }
                    if (message.address.includes('/file-frame-number')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args;
                    }
                    if (message.address.includes('/file-nb-frames')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args;
                    }
                    if (message.address.includes('/loop')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
                    }
                    if (message.address.includes('/paused')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
                    }
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


    setupExpressServer() {
        const server = express();
        const port = 5254;

        // GraphQL Root resolver
        var graphQlRoot = {
            allChannels: () => {
                const ccgString = JSON.stringify(ccgChannel);
                return ccgString;
            },
            channel: (ch) => {
                const ccgChString = JSON.stringify(ccgChannel[ch.ch-1]);
                return ccgChString;
            },
            layer: (args) => {
                const ccgLayerString = JSON.stringify(ccgChannel[args.ch-1].layer[args.l-1]);
                return ccgLayerString;
            },
            timeLeft: (args) => {
                return (ccgChannel[args.ch-1].layer[args.l-1].foreground.length - ccgChannel[args.ch-1].layer[args.l-1].foreground.time);
            }
        };
        server.use('/api', graphqlHTTP({
            schema: apiSchema,
            rootValue: graphQlRoot,
            graphiql: false
        }));
        server.use('/test', graphqlHTTP({
            schema: apiSchema,
            rootValue: graphQlRoot,
            graphiql: true
        }));

        server.listen(port, () => console.log(`GraphQl listening on port ${port}/api`));
    }
}
