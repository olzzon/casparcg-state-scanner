//System:
import net from 'net'; // Used for TCP log server
import fs from 'fs'; // Used for reading casparcg.config file
import os from 'os'; // Used to display (log) network addresses on local machine

//Modules:
import { CasparCG } from 'casparcg-connection';
import osc from 'osc';
import convert from 'xml-js';
import chokidar from 'chokidar'; //Used to watch filesystem for changes

//Utils:
import {cleanUpFilename, extractFilenameFromPath} from './utils/filePathStringHandling';
import {findLayerNumber, findChannelNumber} from './utils/oscStringHandling';
import { generateCcgDataStructure } from './utils/ccgDatasctructure';
import * as Globals from './utils/CONSTANTS';

//GraphQl:
import { ApolloServer, PubSub } from 'apollo-server';
import { CCG_QUERY_SUBSCRIPTION } from './graphql/GraphQlQuerySubscript';


export class App {
    constructor() {
        //Binds:
        this.connectLog = this.connectLog.bind(this);
        this.pulishInfoUpdate = this.pulishInfoUpdate.bind(this);

        //PubSub:
        this.pubsub = new PubSub();

        //Setup AMCP Connection:
        this.ccgConnection = new CasparCG(
            {
                host: Globals.CCG_HOST,
                port: Globals.CCG_AMCP_PORT,
                autoConnect: true,
            }
        );

        //Define vars:
        this.configFile = this.readCasparCgConfigFile();
        this.ccgNumberOfChannels = this.configFile.configuration.channels.channel.length || 1;
        this.ccgChannel = generateCcgDataStructure(this.ccgNumberOfChannels);
        this.serverOnline = false;

        //Setup GraphQL:
        this.setupGraphQlServer();

        //Check CCG Version and initialise OSC server:
        this.ccgConnection.version()
        .then((response) => {
            console.log("ACMP connection established to: ", Globals.CCG_HOST, ":", Globals.CCG_AMCP_PORT);
            console.log("CasparCG Server Version :", response.response.data);
            this.serverVersion = response.response.data;

            if (this.serverVersion < "2.2") {
                //TCP Log is used for triggering fetch of AMCP INFO on CCG 2.1
                this.setupCasparTcpLogServer();
                this.fileWatchSetup(this.configFile.configuration.paths['thumbnail-path']._text);
            } else {
                this.fileWatchSetup(this.configFile.configuration.paths['media-path']._text);
                //ToDo: serveronline is allways true on CCG 2.2
                this.serverOnline = true;
            }
            //OSC server will not recieve data before a CCG connection is established:
            this.setupOscServer();
        });

        //Update of timeleft is set to a default 40ms (same as 25FPS)
        const timeLeftSubscription = setInterval(() => {
            this.pubsub.publish(Globals.PUBSUB_TIMELEFT_UPDATED, { timeLeft: this.ccgChannel });
        },
        40);
    }

    readCasparCgConfigFile() {
        //Read casparcg settingsfile (place a copy of it in this folder if stacanner is not installed in server folder)
        let data = fs.readFileSync('casparcg.config');
        if (data === "") {
            data = "<channel></channel>";
        }
        return convert.xml2js(data, {
            ignoreComment: true,
            alwaysChildren: true,
            compact: true
        });
    }

    //Follow media directories and pubsub if changes occour:
    fileWatchSetup(folder) {
        chokidar.watch(folder,
            {ignored: /(^|[\/\\])\../})
            .on('all', (event, path) => {
                setTimeout(() => {
                    this.pubsub.publish(Globals.PUBSUB_MEDIA_FILE_CHANGED, { mediaFilesChanged: true });
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

    getThisMachineIpAddresses() {
        let interfaces = os.networkInterfaces();
        let ipAddresses = [];
        for (let deviceName in interfaces) {
            let addresses = interfaces[deviceName];
            for (let i = 0; i < addresses.length; i++) {
                let addressInfo = addresses[i];
                if (addressInfo.family === "IPv4" && !addressInfo.internal) {
                    ipAddresses.push(addressInfo.address);
                }
            }
        }
        return ipAddresses;
    }

    setupOscServer() {
        const oscConnection = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: Globals.DEFAULT_OSC_PORT
        });

        oscConnection.on("ready", () => {
            let ipAddresses = this.getThisMachineIpAddresses();

            console.log("Listening for OSC over UDP.");
            ipAddresses.forEach((address) => {
                console.log("OSC Host:", address + ", Port:", oscConnection.options.localPort);
            });
        });

        oscConnection.on('message', (message) => {
            let channelIndex = findChannelNumber(message.address)-1;
            let layerIndex = findLayerNumber(message.address)-1;

            if (message.address.includes('/stage/layer')) {
                //CCG 2.2 Handle OSC /file/path:
                if (message.address.includes('foreground/file/path')) {
                    if (this.ccgChannel[channelIndex].layer[layerIndex].foreground.path != message.args[0]) {
                        this.ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                        this.pulishInfoUpdate(channelIndex);
                    }
                }
                if (message.address.includes('background/file/path')) {
                    if (this.ccgChannel[channelIndex].layer[layerIndex].background.path != message.args[0]) {
                        this.ccgChannel[channelIndex].layer[layerIndex].background.path = message.args[0];
                        this.pulishInfoUpdate(channelIndex);
                    }
                }
                if (message.address.includes('foreground/file/name')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                }
                if (message.address.includes('background/file/name')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].background.name = message.args[0];
                }
                if (message.address.includes('file/time')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args[0];
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args[1];
                }
                if (message.address.includes('loop')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
                }
                if (message.address.includes('/paused')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
                }

                //CCG 2.1 Handle OSC /file/path:
                if (message.address.includes('file/path') && this.serverVersion < "2.2") {
                    if (this.ccgChannel[channelIndex].layer[layerIndex].foreground.name != message.args[0]) {
                        this.ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        this.ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                        this.pulishInfoUpdate(channelIndex);
                    }
                }
            }
        });

        oscConnection.open();
        console.log(`OSC listening on port 5253`);
    }

    pulishInfoUpdate(channelIndex) {
        let ccgPlayLayer = [];

        for (let i=0; i<this.ccgNumberOfChannels; i++) {
            ccgPlayLayer.push({ "layer" : [] });
            ccgPlayLayer[i].layer.push(this.ccgChannel[i].layer[Globals.CCG_DEFAULT_LAYER-1]);
        }
        this.pubsub.publish(Globals.PUBSUB_PLAY_LAYER_UPDATED, { playLayer: ccgPlayLayer });
        this.pubsub.publish(Globals.PUBSUB_INFO_UPDATED, { infoChannelUpdated: channelIndex });
        this.pubsub.publish(Globals.PUBSUB_CHANNELS_UPDATED, { channels: this.ccgChannel });
    }


    setupGraphQlServer() {

        // GraphQL resolver
        const resolvers = {
            Subscription: {
                channels: {
                    subscribe: () => this.pubsub.asyncIterator([Globals.PUBSUB_CHANNELS_UPDATED]),
                },
                playLayer: {
                    subscribe: () => this.pubsub.asyncIterator([Globals.PUBSUB_PLAY_LAYER_UPDATED]),
                },
                infoChannelUpdated: {
                    subscribe: () => this.pubsub.asyncIterator([Globals.PUBSUB_INFO_UPDATED]),
                },
                timeLeft: {
                    subscribe: () => this.pubsub.asyncIterator([Globals.PUBSUB_TIMELEFT_UPDATED]),
                },
                mediaFilesChanged: {
                    subscribe: () => this.pubsub.asyncIterator([Globals.PUBSUB_MEDIA_FILE_CHANGED]),
                }

            },
            Query: {
                channels: () => {
                    return this.ccgChannel;
                },
                layer: (obj, args, context, info) => {
                    const ccgLayerString = JSON.stringify(this.ccgChannel[args.ch-1].layer[args.l-1]);
                    return ccgLayerString;
                },
                timeLeft: (obj, args, context, info) => {
                    return (this.ccgChannel[args.ch-1].layer[args.l-1].foreground.length - this.ccgChannel[args.ch-1].layer[args.l-1].foreground.time);
                },
                serverOnline: () => {
                    return this.serverOnline;
                },
                serverVersion: () => {
                    return this.serverVersion;
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
                    return root.layer[Globals.CCG_DEFAULT_LAYER-1].foreground.length - root.layer[Globals.CCG_DEFAULT_LAYER-1].foreground.time;
                },
                time: (root) => { return root.layer[Globals.CCG_DEFAULT_LAYER-1].foreground.time; }
            }
        };

        const typeDefs = CCG_QUERY_SUBSCRIPTION;
        const server = new ApolloServer({
            typeDefs,
            resolvers
        });

        server.listen(Globals.DEFAULT_GRAPHQL_PORT, () => console.log(`GraphQl listening on port ${Globals.DEFAULT_GRAPHQL_PORT}${server.graphqlPath}`));
    }



    //CCG 2.1 compatibility:
    //Wil be maintanied as long as needed:


    updateAcmpData(channel) {
        return new Promise((resolve, reject) => {
            if (channel > this.ccgNumberOfChannels) {
                resolve(true);
            }
            this.ccgConnection.info(channel,Globals.CCG_DEFAULT_LAYER)
            .then((response) => {
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].foreground.name = extractFilenameFromPath(response.response.data.foreground.producer.filename);
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].background.name = extractFilenameFromPath(response.response.data.background.producer.filename || "");
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].foreground.path = cleanUpFilename(response.response.data.foreground.producer.filename);
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].background.path = cleanUpFilename(response.response.data.background.producer.filename || "");

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


    setupCasparTcpLogServer() {

        //Setup TCP errorlog reciever:
        const casparLogClient = new net.Socket();

        this.connectLog(Globals.CCG_LOG_PORT, Globals.CCG_HOST, casparLogClient);

        casparLogClient.on('error', (error) => {
            console.log("WARNING: LOAD and LOADBG commands will not update state as the");
            console.log("CasparCG server is offline or TCP log is not enabled in config", error);
            console.log('casparcg tcp log should be set to IP: ' + Globals.CCG_HOST + " Port : " + Globals.CCG_LOG_PORT);
            this.serverOnline = false;
            let intervalConnect = setTimeout(() => this.connectLog(Globals.CCG_LOG_PORT, Globals.CCG_HOST, casparLogClient), 5000);
        });
        casparLogClient.on('data', (data) => {
            console.log("New LOG line: ", data.toString());
            if (data.includes("LOADBG ") || data.includes("LOAD ") || data.includes("PLAY ")) {
                this.updateAcmpData(1)
                .then(() => {
                let channel = this.readLogChannel(data.toString(), "LOAD");
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
            this.serverOnline = true;
        });
    }

    readLogChannel(data, commandName, varName) {
        let amcpCommand = data.substr(data.indexOf(commandName));
        let amcpChannel = parseInt(amcpCommand.substr(amcpCommand.indexOf(" ")+1, amcpCommand.indexOf("-")-1));
        let amcpLayer = parseInt(amcpCommand.substr(amcpCommand.indexOf("-")+1, 2));
        let nameStart = amcpCommand.indexOf('"', 1);
        let nameEnd = amcpCommand.indexOf('"', nameStart + 1);
        return amcpChannel;
    }


}
