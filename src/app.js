const osc = require('osc');
const express = require('express');
var express_graphql = require('express-graphql');
var { buildSchema } = require('graphql');

//This is how a OSC message from CCG look like:
/*
        /channel/1/stage/layer/10/background/producer : <OSCVal s "empty">
        /channel/1/stage/layer/10/foreground/file/name : <OSCVal s "go1080p25.mp4">
        /channel/1/stage/layer/10/foreground/file/path : <OSCVal s "media/go1080p25.mp4">
        /channel/1/stage/layer/10/foreground/file/streams/0/fps : (
            "<OSCVal i 25>",
            "<OSCVal i 1>"
        )
        /channel/1/stage/layer/10/foreground/file/streams/1/fps : (
            "<OSCVal i 0>",
            "<OSCVal i 0>"
        )
        /channel/1/stage/layer/10/foreground/file/time : (
            "<OSCVal f 7.940000>",
            "<OSCVal f 17.799999>"
        )
        /channel/1/stage/layer/10/foreground/loop : <OSCVal T>
        /channel/1/stage/layer/10/foreground/paused : <OSCVal F>
        /channel/1/stage/layer/10/foreground/producer : <OSCVal s "ffmpeg">
*/

//Build GraphQl Schemes:
var apiSchema = buildSchema(`
  type Query {
    channelPlaying: Boolean
    foregroundName: String
    backgroundName: String
  }
`);

export class App {
    constructor() {
        this.playing = false;
        this.foregroundName = 'foregroundname not yet recieved';
        this.backgroundName = 'backgroundname not yet recieved';
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
            var channelNumber = this.findChannelNumber(message.address);
            var layerNumber = this.findLayerNumber(message.address);
            if (message.address.includes('/foreground/file/name')) {
                this.foregroundName = message.args[0];                
            }
            if (message.address.includes('/background/file/name')) {
                this.backgroundName = message.args[0];                
            }

            //console.log(message.address, message.args);
        });

        oscConnection.open(); 
        console.log(`OSC listening on port 5253`);

    }

    findChannelNumber(string) {
        var channel = string.replace("/channel/", "");
        channel = channel.slice(0, (channel.indexOf("/")));
        //console.log(channel);
        return channel;
    }

    findLayerNumber(string) {
        var channel = string.slice(string.indexOf('layer')+5);
        channel = channel.slice(0, (channel.indexOf("/")));
        //console.log(channel);
        return channel;
    }


    setupExpressServer() {
        const server = express();
        const port = 5254;

        //server.get('/name', (req, res) => res.send(this.foregroundProducername));
        //server.get('/playing', (req, res) => res.send(this.playing));

        // Root resolver
        var graphQlRoot = {
            foregroundName: () => this.foregroundName,
            backgroundName: () => this.backgroundName,
        };
        server.use('/api', express_graphql({
            schema: apiSchema,
            rootValue: graphQlRoot,
            graphiql: true
        }));

        server.listen(port, () => console.log(`GraphQl listening on port ${port}/api`));
    }
}