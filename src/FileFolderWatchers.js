import chokidar from 'chokidar'; //Used to watch filesystem for changes
import * as Globals from './utils/CONSTANTS';


//Follow media directories and pubsub if changes occour:
export const mediaFileWatchSetup = (folder, pubsub) => {
    this.pubsub = pubsub;
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
};
