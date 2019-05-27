//GraphQl:
import { ApolloServer } from 'apollo-server';
import { CCG_QUERY_SUBSCRIPTION } from './graphql/GraphQlQuerySubscript';

//Utils:
import * as Globals from './utils/CONSTANTS';


export class CcgGraphQlServer {
    constructor(pubsub, ccgChannel, mediaFolders) {
        this.pubsub = pubsub;
        this.ccgChannel = ccgChannel;
        this.mediaFolders = mediaFolders;
        this.serverOnline = false;

        this.setServerOnline = this.setServerOnline.bind(this);
        this.getServerOnline = this.getServerOnline.bind(this);

        this.setupGraphQlServer();
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
                    return this.getServerOnline();
                },
                mediaFolders: () => {
                    return global.mediaFolders;
                },
                dataFolders: () => {
                    return global.dataFolders;
                },
                templateFolders: () => {
                    return global.templateFolders;
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

    setServerOnline(state) {
        this.serverOnline = state;
    }
    getServerOnline() {
        return this.serverOnline;
    }
}
