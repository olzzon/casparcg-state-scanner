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
                console.log("Media Files Changes :" ,event, path);
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


//Follow media directories and update mediaFolders if changes occour:
export const mediaFolderWatchSetup = (folder) => {
    chokidar.watch(folder,
        {ignored: /(^|[\/\\])\../})
        .on('all', (event, path) => {
            global.mediaFolders = getFolders(folder);
        })
        .on('ready', (event, path) => {
            console.log("Media Folder Watch Ready ");
        })
        .on('error', (event,path) => {
            console.log("Media Folder Watch Error:",event, path);
        })
        ;
};

//Follow data directories and update mediaFolders if changes occour:
export const dataFolderWatchSetup = (folder) => {
    chokidar.watch(folder,
        {ignored: /(^|[\/\\])\../})
        .on('all', (event, path) => {
            global.dataFolders = getFolders(folder);
        })
        .on('ready', (event, path) => {
            console.log("Data Folder Watch Ready ");
        })
        .on('error', (event,path) => {
            console.log("Data Folder Watch Error:",event, path);
        })
        ;
};

//Follow template directories and update mediaFolders if changes occour:
export const templateFolderWatchSetup = (folder) => {
    chokidar.watch(folder,
        {ignored: /(^|[\/\\])\../})
        .on('all', (event, path) => {
            global.templateFolders = getFolders(folder);
        })
        .on('ready', (event, path) => {
            console.log("Template Folder Watch Ready ");
        })
        .on('error', (event,path) => {
            console.log("Template Folder Watch Error:",event, path);
        })
        ;
};
