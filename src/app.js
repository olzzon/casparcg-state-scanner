//System:
import net from 'net'; // Used for TCP log server

//Modules:
import { CasparCG } from 'casparcg-connection';
import chokidar from 'chokidar'; //Used to watch filesystem for changes

//Utils:
import {cleanUpFilename, extractFilenameFromPath} from './utils/filePathStringHandling';
import { generateCcgDataStructure } from './utils/ccgDatasctructure';
import { readCasparCgConfigFile } from './utils/casparCGconfigFileReader';
import { OscServer } from './OscServer';
import { CcgGraphQlServer } from './GraphQlServer';
import { getMediaFolders } from './utils/getMediaFolderStructure';
import * as Globals from './utils/CONSTANTS';


//GraphQl:
import { PubSub } from 'apollo-server';

export class App {
    constructor() {
        //Binds:
        this.connectLog = this.connectLog.bind(this);
        this.startSubscriptions = this.startTimerControlledServices.bind(this);

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
        this.configFile = readCasparCgConfigFile();
        this.ccgNumberOfChannels = this.configFile.configuration.channels.channel.length || 1;
        this.ccgChannel = generateCcgDataStructure(this.ccgNumberOfChannels);

        //Get folder structure in media path:
        this.mediaFolders = getMediaFolders(this.configFile.configuration.paths['media-path']._text);
        console.log("Media Folders :", this.mediaFolders);

        //Setup GraphQL:
        this.graphQlServer = new CcgGraphQlServer(this.pubsub, this.ccgChannel, this.mediaFolders);

        //Check CCG Version and initialise OSC server:
        console.log("Checking CasparCG connection");
        this.ccgConnection.version()
        .then((response) => {
            console.log("AMCP connection established to: ", Globals.CCG_HOST, ":", Globals.CCG_AMCP_PORT);
            console.log("CasparCG Server Version :", response.response.data);
            this.serverVersion = response.response.data;

            if (this.serverVersion < "2.2") {
                //TCP Log is used for triggering fetch of AMCP INFO on CCG 2.1
                this.setupCasparTcpLogServer();
                this.fileWatchSetup(this.configFile.configuration.paths['thumbnail-path']._text);
            } else {
                this.fileWatchSetup(this.configFile.configuration.paths['media-path']._text);
            }
            //OSC server will not recieve data before a CCG connection is established:
            this.oscServer = new OscServer(this.pubsub, this.ccgChannel, this.ccgNumberOfChannels, this.serverVersion);
        })
        .catch((error) => {
            console.log("No connection to CasparCG");
        });


        this.startTimerControlledServices();
    }

    startTimerControlledServices() {
        //Update of timeleft is set to a default 40ms (same as 25FPS)
        const timeLeftSubscription = setInterval(() => {
            if (this.graphQlServer.getServerOnline()) {
                this.pubsub.publish(Globals.PUBSUB_TIMELEFT_UPDATED, { timeLeft: this.ccgChannel });
            }
        },
        40);
        //Check server online:
        const serverOnlineSubscription = setInterval(() => {
            this.ccgConnection.version()
            .then(() => {
                this.graphQlServer.setServerOnline(true);
            })
            .catch((error) => {
                console.log("Server not connected :", error);
                this.graphQlServer.setServerOnline(false);
            });
        },
        3000);
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

    // Rest of the code is for
    // CCG 2.1 compatibility
    // And wil be maintanied as long as needed:

    updateData(channel) {
        return new Promise((resolve, reject) => {
            if (channel > this.ccgNumberOfChannels) {
                resolve(true);
                return;
            }
            this.ccgConnection.info(channel,Globals.CCG_DEFAULT_LAYER)
            .then((response) => {
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].foreground.name = extractFilenameFromPath(response.response.data.foreground.producer.filename);
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].background.name = extractFilenameFromPath(response.response.data.background.producer.filename || "");
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].foreground.path = cleanUpFilename(response.response.data.foreground.producer.filename);
                this.ccgChannel[channel-1].layer[Globals.CCG_DEFAULT_LAYER-1].background.path = cleanUpFilename(response.response.data.background.producer.filename || "");

                this.updateData(channel + 1)
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
            this.graphQlServer.setServerOnline(false);
            let intervalConnect = setTimeout(() => this.connectLog(Globals.CCG_LOG_PORT, Globals.CCG_HOST, casparLogClient), 5000);
        });
        casparLogClient.on('data', (data) => {
            console.log("New LOG line: ", data.toString());
            if (data.includes("LOADBG ") || data.includes("LOAD ") || data.includes("PLAY ")) {
                this.updateData(1)
                .then(() => {
                let channel = this.readLogChannel(data.toString(), "LOAD");
                    if ( channel > 0) {
                        this.oscServer.pulishInfoUpdate(channel, this.ccgChannel);
                    }
                });
            }
        });
    }

    connectLog(port, host, client) {
        client.connect(port, host, () => {
            console.log('CasparLogClient connected to: ' + host + ':' + port);
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
