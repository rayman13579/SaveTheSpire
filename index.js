const express = require('express');
const fs = require('fs');
const decompress = require('decompress');
const archiver = require('archiver');
const dateformat = require('dateformat');
const app = express();
const httpPort = 2929;
const http = require('http');
const multer = require('multer');
const simpleGit = require('simple-git');
const { resolve } = require('path');

let logDateFormat = 'yyyy.mm.dd HH:MM:ss';

let pcDateFormat = 'yyyymmddHHMMss';

let androidDateFormat = 'mm/dd/yyyy HH:MM:ss';

const git = simpleGit({ baseDir: __dirname + '/files' });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '.zip')
    }
})
const upload = multer({ storage: storage, preservePath: true });

http.createServer(app).listen(httpPort, () => console.log('Listening for HTTP on %s...', httpPort));

app.put('/upload', upload.single('saveTheSpire'), async (req, res) => {
    console.log('');
    let userAgent = req.headers['user-agent'];
    log(userAgent, 'uploading save');
    clearDirectory(userAgent);
    unzip(userAgent, req.file.filename)
        .then(() => {
            backupSave(userAgent);
            deleteZip(userAgent, req.file.filename);
            res.send(204);
        })
        .catch(err => {
            log(userAgent, err);
            res.send(500);
        });
});

app.get('/download', (req, res) => {
    console.log('');
    let userAgent = req.headers['user-agent'];
    log(userAgent, 'downloading save');
    convertDates(userAgent);
    zip(userAgent, 'saveTheSpire.zip')
        .then(() => {
            res.download(__dirname + '/saveTheSpire.zip');
        })
        .catch(err => {
            log(userAgent, err);
            res.send(500);
        })
        .finally(() => {
            deleteZip(userAgent);
        });
});

let clearDirectory = userAgent => {
    fs.rm(__dirname + '/files/preferences', { recursive: true, force: true }, () => { });
    fs.rm(__dirname + '/files/runs', { recursive: true, force: true }, () => { });
    fs.rm(__dirname + '/files/saves', { recursive: true, force: true }, () => { });
    log(userAgent, 'directory cleared');
}

let deleteZip = (userAgent) => {
    fs.rm(__dirname + '/saveTheSpire.zip', () => { });
    log(userAgent, 'deleted zip');
}

let unzip = async (userAgent, filename) => {
    await decompress(__dirname + "/" + filename, __dirname + '/files')
        .then(files => {
            convertFiles(files);
            log(userAgent, 'unzipped save');
            resolve();
        })
        .catch(err => {
            log(userAgent, err);
            reject();
        });
}

let zip = (userAgent, filename) => {
    return new Promise((resolve, reject) => {
        let output = fs.createWriteStream(__dirname + '/' + filename);
        let archive = archiver('zip', {
            zlib: { level: 9 }
        });
        output.on('close', () => {
            log(userAgent, 'created zip');
            resolve();
        });
        archive.on('warning', (err) => {
            log(userAgent, err);
        });
        archive.on('error', (err) => {
            log(userAgent, err);
            reject();
        });
        archive.pipe(output);
        archive.glob('**/*', {
            cwd: __dirname + '/files',
            ignore: ['.git/**']
        });
        archive.finalize();
    });
}

let backupSave = userAgent => {
    git
        .add('*')
        .commit(dateformat(new Date(), logDateFormat) + ' ' + userAgent)
        .push('origin', 'master');
    log(userAgent, 'pushed to git');
}

let convertFiles = (files) => {
    for (let file of files) {
        if (file.path.startsWith('saves/')) {
            decodeSave(file);
        }
    }
}

let decodeSave = (file) => {
    let encoded = file.data.toString('utf8');
    if (encoded.startsWith('{')) return;

    let saveBytes = Buffer.from(encoded, 'base64');
    let keyBytes = new TextEncoder().encode("key");

    let decodedBytes = [];
    for (let i = 0; i < saveBytes.length; i++) {
        decodedBytes.push(saveBytes[i] ^ keyBytes[i % keyBytes.length]);
    }
    let decoded = String.fromCharCode(...decodedBytes);
    fs.writeFileSync(__dirname + '/files/' + file.path, decoded);
}

let convertDates = (userAgent) => {
    let characters = fs.readdirSync(__dirname + '/files/runs');
    for (let character of characters) {
        let files = fs.readdirSync(__dirname + '/files/runs/' + character);
        for (let file of files) {
            let run = JSON.parse(fs.readFileSync(__dirname + '/files/runs/' + character + '/' + file).toString('utf8'));
            run.local_time = formatDateTime(run.local_time, userAgent);
            fs.writeFileSync(__dirname + '/files/runs/' + character + '/' + file, JSON.stringify(run));
        }
    }
}

let formatDateTime = (dateTime, userAgent) => {
    if (!dateTime.includes('/')) {
        dateTime = splitDateTime(dateTime);
    }
    if (userAgent === 'SaveTheSpirePC') {
        return dateformat(dateTime, pcDateFormat);
    }
    return dateformat(dateTime, androidDateFormat);
}

let splitDateTime = (dateTime) => {
    let year = dateTime.substring(0, 4);
    let month = dateTime.substring(4, 6);
    let day = dateTime.substring(6, 8);
    let hour = dateTime.substring(8, 10);
    let minute = dateTime.substring(10, 12);
    let second = dateTime.substring(12, 14);

    let date = new Date(year, month - 1, day, hour, minute, second);

    return dateformat(date, androidDateFormat);
}

let log = (userAgent, message) => {
    console.log(dateformat(new Date(), logDateFormat) + ' | ' + userAgent + ' | ' + message);
}
