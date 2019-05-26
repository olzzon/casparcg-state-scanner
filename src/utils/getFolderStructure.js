import fs from 'fs';

export const getFolders = (path) => {
    let dirList = getDirectories(path).map((dir) => {
        return {'folder': dir};
    });
    return dirList;
};

function getDirectories(path) {
    return fs.readdirSync(path).filter(function (file) {
        return fs.statSync(path+'/'+file).isDirectory();
    });
}
