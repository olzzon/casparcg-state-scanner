import FileHound from 'filehound';

export const getFolders = (path) => {
    let dirList = _getDirectories(path).map((dir) => {
        return {'folder': dir};
    });
    return dirList;
};

function _getDirectories(path) {
    return FileHound.create()
    .path(path)
    .directory()
    .findSync();
}
