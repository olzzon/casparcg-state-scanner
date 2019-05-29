export interface ccgChannel {
    layer: Array<ccgLayer>
};

export interface ccgLayer {
    "foreground": {
        "name": string,
        "path": string,
        "time": number,
        "length": number,
        "loop": boolean,
        "paused": boolean
    },
    "background": {
        "name": string,
        "path": string,
        "time": number,
        "length": number,
        "loop": boolean,
        "paused": boolean
    }
}


export interface ccgChannels extends Array<ccgChannel>{}

