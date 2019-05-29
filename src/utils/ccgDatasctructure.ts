import { ccgChannel, ccgChannels } from '../@types/ICcgDataStructure';

export const generateCcgDataStructure = ((ccgNumberOfChannels: number): ccgChannels => {
    let ccgChannels: ccgChannels = [];
    let channel: ccgChannel = {
        layer: [{
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
        }]
    }

    // Assign empty values to ccgChannel object
    for (let ch=0; ch<ccgNumberOfChannels; ch++) {
        ccgChannels.push(channel);
    }
    return ccgChannels;
});
