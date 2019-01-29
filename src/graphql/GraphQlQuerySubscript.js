import gql from 'graphql-tag';

export const CCG_QUERY_SUBSCRIPTION = gql `
        type Subscription {
            channels: [Channels]
            playLayer : [Channels]
            infoChannelUpdated: String
            timeLeft: [Timeleft]
            mediaFilesChanged: Boolean
        },
        type Query {
            serverOnline: Boolean
            serverVersion: String
            channels: [Channels]
            layer(ch: Int!, l: Int!): String
            timeLeft(ch: Int!, l: Int!): String
        },
        type Channels {
            layers: [Layers]
        },
        type Layers {
            foreground: Foreground
            background: Background
        },
        type Foreground {
            name: String
            path: String
            length: Float
            loop: Boolean
            paused: Boolean
        }
        type Background {
            name: String
            path: String
            length: Float
            loop: Boolean
        }
        type Timeleft {
            timeLeft: Float
            time: Float
        }
        `;
