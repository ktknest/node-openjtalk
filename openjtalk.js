const exec = require('child_process').exec;
const path = require('path');
const uuid = require('uuid-v4');

const DefaultOptions = {
  openjtalk_bin : path.join(__dirname, '/bin/open_jtalk'),
  dic_dir       : path.join(__dirname, '/dic/open_jtalk_dic_utf_8-1.09'),
  htsvoice      : path.join(__dirname, '/voice/mei/mei_normal.htsvoice'),
};

class OpenJTalk {
  constructor(args = {}) {
    const options = DefaultOptions;
    for (let key in args) {
      options[key] = args[key];
    }
    for (let key in options) {
      this[key] = options[key];
    }
  }

  talk(str /*, [pitch, [callback]] */) {
    // 引数の展開
    let pitch    = this.pitch;
    let callback = null;

    if (typeof(arguments[1]) === 'number') {
      pitch = arguments[1];
    }
    for (let i = 1; i <= 2; ++i) {
      if (typeof(arguments[i]) === 'function') {
        callback = arguments[i];
        break;
      }
    }
    this._makeWav(str, pitch, (err, result) => {
      if (err) {
        callback && callback(err, null);
        return;
      }
      this._play(result.wav, callback);
    });
  }

  // wav を再生する
  _play(wavFileName, callback) {
    // escape
    wavFileName = wavFileName.split(/\s/).join('');

    let player;
    switch (process.platform) {
      case 'darwin' : player = 'afplay'; break;
      case 'linux'  : player = 'aplay';  break;
      default       : player = 'play';   break;
    }
    const cmd = `${player} ${wavFileName}&& rm ${wavFileName}`;
    exec(cmd, (err, stdout, stderr) => {
      callback && callback(err, stdout, stderr);
    });
  }

  // exec から open_jtalk を実行して wav ファイルを作る
  _makeWav(str, pitch, callback) {
    const wavFileName =  `${uuid()}.wav`;

    let ojtCmd = this.openjtalk_bin;
    const options = {
      m  : this.htsvoice,
      x  : this.dic_dir,
      s  : this.sampling_rate,
      p  : pitch,
      a  : this.alpha,
      b  : this.beta,
      u  : this.uv_threshold,
      jm : this.gv_weight_mgc,
      jf : this.gv_weight_lf0,
      z  : this.audio_buff_size,
      ow : wavFileName
    };
    for (let option in options) {
      const value = options[option];
      if (value) {
        ojtCmd += ` -${option} ${value}`;
      }
    }

    const cmd = `echo "${str}" | ${ojtCmd}`;
    exec(cmd, (err, stdout, stderr) => {
      const result = {
        stdout : stdout,
        stderr : stderr,
        wav    : wavFileName
      };
      callback && callback(err, result);
    });
  }
}

module.exports = OpenJTalk;
