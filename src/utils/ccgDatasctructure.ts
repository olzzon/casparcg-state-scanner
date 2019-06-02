import { ccgChannel, ccgChannels } from '../@types/ICcgDataStructure';

export const generateCcgDataStructure = ((ccgNumberOfChannels: number): ccgChannels => {
    let ccgChannels: ccgChannels = [];

    // Assign empty values to ccgChannel object
    for (let ch=0; ch<ccgNumberOfChannels; ch++) {
        ccgChannels.push(
            { layer: [] }
        );
        for (let l=0; l<30; l++) {
            ccgChannels[ch].layer.push({
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
            })
        }
    }
    return ccgChannels;
});
