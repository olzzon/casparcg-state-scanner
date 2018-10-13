import { CcgStateOSC } from './casparCGStateOSC';
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
        this.foregroundName = 'TEST OF FRONT';
        this.backgroundName = 'TEST OF BACK';
        this.setupOscServer();
        this.setupExpressServer();
    }

    setupOscServer() {
        const oscConnection = new CcgStateOSC({ plugin: new CcgStateOSC.WebsocketServerPlugin({ port: 5900 }) });
        oscConnection.connect(); 
        oscConnection.on('/channel/1/stage/layer/10/foreground/file/name', (message) => {
            this.foregroundName = message.args;
            console.log(message.args);
        });
        oscConnection.on('/channel/1/stage/layer/10/background/file/name', (message) => {
            this.backgroundName = message.args;
            console.log(message.args);
        });
    }


    setupExpressServer() {
        const server = express();
        const port = 5254;

        //server.get('/name', (req, res) => res.send(this.foregroundProducername));
        //server.get('/playing', (req, res) => res.send(this.playing));

        // Root resolver
        var graphQlRoot = {
            channelPlaying: () => this.playing,
            foregroundName: () => this.foregroundName,
            backgroundName: () => this.backgroundName,
        };
        server.use('/api', express_graphql({
            schema: apiSchema,
            rootValue: graphQlRoot,
            graphiql: true
        }));

        server.listen(port, () => console.log(`Example app listening on port ${port}!`));
    }
}