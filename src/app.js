const osc = require('osc');
const express = require('express');
var graphqlHTTP = require('express-graphql');
var { buildSchema } = require('graphql');

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
        this.setupOscServer();
        this.setupExpressServer();
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
            //Handle foreground messages:
            if (message.address.includes('/foreground/file/name')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
            }
            if (message.address.includes('/foreground/file/path')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
            }
            if (message.address.includes('/foreground/file/time')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args[0];
                ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args[1];
            }
            if (message.address.includes('/foreground/loop')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
            }
            if (message.address.includes('/foreground/paused')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
            }
            //Handle background messages:
            if (message.address.includes('/background/file/name')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
            }
            if (message.address.includes('/background/file/path')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
            }
            if (message.address.includes('/background/file/time')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args[0];
                ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args[1];
            }
            if (message.address.includes('/background/loop')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
            }
            if (message.address.includes('/background/paused')) {
                ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
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
                return ccgString.replace(/"([^(")"]+)":/g,"$1:");
            },
            channel: (ch) => {
                const ccgChString = JSON.stringify(ccgChannel[ch.ch-1]);
                return ccgChString.replace(/"([^(")"]+)":/g,"$1:");
            },
            layer: (args) => {
                const ccgLayerString = JSON.stringify(ccgChannel[args.ch-1].layer[args.l-1]);
                return ccgLayerString.replace(/\\/g,"");
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
