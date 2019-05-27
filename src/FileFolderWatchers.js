import chokidar from 'chokidar'; //Used to watch filesystem for changes
import * as Globals from './utils/CONSTANTS';
import { getFolders } from './utils/getFolderStructure';

//Follow media directories and pubsub if changes occour:
export const mediaFileWatchSetup = (folder, pubsub) => {
    chokidar.watch(folder,
        {ignored: /(^|[\/\\])\../})
        .on('all', (event, path) => {
            setTimeout(() => {
                pubsub.publish(Globals.PUBSUB_MEDIA_FILE_CHANGED, { mediaFilesChanged: true });
                console.log("File/Folder Changes :" ,event, path);
            }, 10);
        })
        .on('ready', (event, path) => {
            console.log("Media Files Watch Ready ");
        })
        .on('error', (event,path) => {
            console.log("Media Files Watch Error:",event, path);
        })
        ;
};


//Follow media directories and pubsub if changes occour:
export const mediaFolderWatchSetup = (mediaFolders) => {
    chokidar.watch(folder,
        {ignored: /(^|[\/\\])\../})
        .on('all', (event, path) => {
            mediaFolders = getFolders(this.configFile.configuration.paths['media-path']._text);
        })
        .on('ready', (event, path) => {
            console.log("Media Folder Watch Ready ");
        })
        .on('error', (event,path) => {
            console.log("Media Folder Watch Error:",event, path);
        })
        ;
};
