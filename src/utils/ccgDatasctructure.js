import * as Globals from './CONSTANTS';

export const generateCcgDataStructure = ((ccgNumberOfChannels) => {
    let channel = [];
    let obj = {
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
    let layers = [];
    for (let ch=0; ch<ccgNumberOfChannels; ch++) {
        for (let l=0; l < Globals.CCG_NUMBER_OF_LAYERS; l++) {
            layers[l] = JSON.parse(JSON.stringify(obj));
        }
        channel[ch] = channel[ch] = JSON.parse(JSON.stringify({ "layer" : layers }));
    }
    return channel;
});
