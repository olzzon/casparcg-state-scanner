//Node Modules:
import os from 'os'; // Used to display (log) network addresses on local machine
import osc from 'osc'; //Using OSC fork from PieceMeta/osc.js as it has excluded hardware serialport support and thereby is crossplatform

//Types:
import * as DEFAULTS from './utils/CONSTANTS';
import { ccgChannel, ccgLayer, ccgChannels } from './@types/ICcgDataStructure';

export class OscServer {
    pubsub: any;
    ccgChannel: ccgChannels;
    ccgNumberOfChannels: number;

    constructor(pubsub: any, ccgChannel: ccgChannels, ccgNumberOfChannels: any) {
        this.pubsub = pubsub;
        this.ccgChannel = ccgChannel;
        this.ccgNumberOfChannels = ccgNumberOfChannels;
        this.setupOscServer();
    }

    setupOscServer() {
        const oscConnection = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: DEFAULTS.DEFAULT_OSC_PORT
        });

        oscConnection
        .on("ready", () => {
            let ipAddresses = this.getThisMachineIpAddresses();

            console.log("Listening for OSC over UDP.");
            ipAddresses.forEach((address) => {
                console.log("OSC Host:", address + ", Port:", oscConnection.options.localPort);
            });
        })
        .on('message', (message: any) => {
            let channelIndex = this.findChannelNumber(message.address)-1;
            let layerIndex = this.findLayerNumber(message.address)-1;

            if (message.address.includes('/stage/layer')) {
                //CCG 2.2 Handle OSC /file/path:
                if (message.address.includes('foreground/file/path')) {
                    if (this.ccgChannel[channelIndex].layer[layerIndex].foreground.path != message.args[0]) {
                        this.ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                        this.publishInfoUpdate(channelIndex);
                    }
                }
                if (message.address.includes('background/file/path')) {
                    if (this.ccgChannel[channelIndex].layer[layerIndex].background.path != message.args[0]) {
                        this.ccgChannel[channelIndex].layer[layerIndex].background.path = message.args[0];
                        this.publishInfoUpdate(channelIndex);
                    }
                }
                if (message.address.includes('foreground/file/name')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                }
                if (message.address.includes('background/file/name')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].background.name = message.args[0];
                }
                if (message.address.includes('file/time')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.time = parseFloat(message.args[0]);
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.length = parseFloat(message.args[1]);
                }
                if (message.address.includes('loop')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
                }
                if (message.address.includes('/paused')) {
                    this.ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
                }

                //CCG 2.1 Handle OSC /file/path:
                if (message.address.includes('file/path') && global.serverVersion < "2.2") {
                    if (this.ccgChannel[channelIndex].layer[layerIndex].foreground.name != message.args[0]) {
                        this.ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        this.ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                        this.publishInfoUpdate(channelIndex);
                    }
                }
            }
        })
        .on('error', (error: any) => {
            console.log("OSC error :", error);
        });

        oscConnection.open();
        console.log(`OSC listening on port 5253`);
    }

    publishInfoUpdate(channelIndex: number) {
        let layerProto = {
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
        let ccgPlayLayer: Array<ccgLayer> = [layerProto];

        for (let i=0; i<this.ccgNumberOfChannels; i++) {
            ccgPlayLayer.push(layerProto);
            ccgPlayLayer[i] = (this.ccgChannel[i].layer[DEFAULTS.CCG_DEFAULT_LAYER-1]);
        }
        this.pubsub.publish(DEFAULTS.PUBSUB_PLAY_LAYER_UPDATED, { playLayer: ccgPlayLayer });
        this.pubsub.publish(DEFAULTS.PUBSUB_INFO_UPDATED, { infoChannelUpdated: channelIndex });
        this.pubsub.publish(DEFAULTS.PUBSUB_CHANNELS_UPDATED, { channels: this.ccgChannel });
    }


    getThisMachineIpAddresses() {
        let interfaces = os.networkInterfaces();
        let ipAddresses: Array<string> = [];
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

    findChannelNumber(string: string): number {
        let channel = string.replace("/channel/", "");
        channel = channel.slice(0, (channel.indexOf("/")));
        return parseInt(channel);
    }

    findLayerNumber(string: string): number {
        let channel = string.slice(string.indexOf('layer/')+6);
        channel = channel.slice(0, (channel.indexOf("/")));
        return parseInt(channel);
    }

}
