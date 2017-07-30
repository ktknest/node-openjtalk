const spawn = require('child_process').spawn;
const path = require('path');
const uuid = require('uuid-v4');

const DefaultOptions = {
  openjtalk_bin : path.join(__dirname, '/bin/open_jtalk'),
  dic_dir       : path.join(__dirname, '/dic/open_jtalk_dic_utf_8-1.09'),
  htsvoice      : path.join(__dirname, '/voice/mei/mei_normal.htsvoice'),
};

class OpenJTalk {
  constructor(args = {}) {
    this.data = {};

    const options = DefaultOptions;
    for (let key in args) {
      options[key] = args[key];
    }
    for (let key in options) {
      this[key] = options[key];
    }

    switch (process.platform) {
      case 'darwin' : this.player = 'afplay'; break;
      case 'linux'  : this.player = 'aplay';  break;
      default       : this.player = 'play';   break;
    }
  }

  /**
   * 文字列を再生する
   * @param {string} str
   * @param {number|Function} [pitch|callback]
   * @param {Function} [callback]
   * @return {Function} killTalk
   */
  talk(str /*, [pitch, [callback]] */) {
    // 引数の展開
    let pitch    = this.pitch;
    let callback = null;
    let childProcess = null;

    if (typeof(arguments[1]) === 'number') {
      pitch = arguments[1];
    }
    for (let i = 1; i <= 2; ++i) {
      if (typeof(arguments[i]) === 'function') {
        callback = arguments[i];
        break;
      }
    }

    if (this.data[str]) {
      childProcess = this._play(str, callback);

    } else {
      childProcess = this._makeWav(str, pitch, (code) => {
        if (code !== 0) {
          return;
        }
        childProcess = this._play(str, callback);
      });
    }

    return function killTalk() {
      childProcess && childProcess.kill();
    };
  }

  /**
   * 複数の文字列を再生する
   * @param {string[]} list
   * @param {number|Function} [pitch|callback]
   * @param {Function} [callback]
   * @return {Function} killTalkList
   */
  talkList(list /*, [pitch, [callback]] */) {
    // 引数の展開
    let pitch    = this.pitch;
    let callback = null;
    let childProcess = null;

    if (typeof(arguments[1]) === 'number') {
      pitch = arguments[1];
    }
    for (let i = 1; i <= 2; ++i) {
      if (typeof(arguments[i]) === 'function') {
        callback = arguments[i];
        break;
      }
    }

    let makeProcess = null;
    let playProcess = null;

    const playList = [...list];

    const makePromise = list.reduce((prev, str) => {
      const next = new Promise((resolve, reject) => {
        makeProcess = this._makeWav(str, this.pitch, (code) => {
          if (!playProcess && playList.indexOf(str) === 0) {
            play(str);
          }

          resolve();
        });
      });
      return prev.then(next);
    }, Promise.resolve(100));

    const play = (str => {
      playProcess = this._play(str, () => {
        playList.shift(0);
        if (playList.length === 0) {
          callback && callback();
          return;
        }

        const nextStr = playList[0];
        if (this.data[nextStr]) {
          play(nextStr);
        } else {
          playProcess = null;
        }
      });
    }).bind(this);

    return function killTalkList() {
      playList.splice(0);
      makeProcess && makeProcess.kill();
      playProcess && playProcess.kill();
    };
  }

  /**
   * wavファイルを削除
   */
  remove(str) {
    if (this.data[str]) {
      spawn('rm', [this.data[str]]);
      delete this.data[str];
    }
  }

  /**
   * wavファイルを全て削除
   */
  removeAll() {
    Object.keys(this.data).forEach(str => this.remove(str));
  }

  /**
   * wav を再生する
   * @param {string} str
   * @param {Function} callback
   * @return {ChildProcess}
   */
  _play(str, callback) {
    const wavFileName = this.data[str].split(/\s/).join('');

    const playerProcess = spawn(this.player, [wavFileName]);

    playerProcess.stdout.on('data', data => {
      console.log(`${this.player} stdout: ${data}`);
    });

    playerProcess.stderr.on('data', data => {
      console.log(`${this.player} stderr: ${data}`);
    });

    playerProcess.on('close', code => {
      callback && callback(code);
    });

    return playerProcess;
  }

  /**
   * spawn から open_jtalk を実行して wav ファイルを作る
   * @param {string} str
   * @param {number} pitch
   * @param {Function} callback
   * @return {ChildProcess}
   */
  _makeWav(str, pitch, callback) {
    const wavFileName =  `${uuid()}.wav`;

    const ojtCmd = this.openjtalk_bin;
    const ojtCmdOptions = [];
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
        ojtCmdOptions.push(`-${option}`);
        ojtCmdOptions.push(value);
      }
    }

    const echoProcess = spawn('echo', [str]);
    const openjtalkProcess = spawn(ojtCmd, ojtCmdOptions);

    echoProcess.stdout.on('data', data => {
      openjtalkProcess.stdin.write(data);
    });

    echoProcess.stderr.on('data', data => {
      console.log(`echo stderr: ${data}`);
    });

    echoProcess.on('close', code => {
      if (code !== 0) {
        console.log(`echo process exited with code ${code}`);
      }
      openjtalkProcess.stdin.end();
    });

    openjtalkProcess.stdout.on('data', data => {
      console.log(`openjtalk stdout: ${data}`);
    });

    openjtalkProcess.stderr.on('data', data => {
      console.log(`openjtalk stderr: ${data}`);
    });

    openjtalkProcess.on('close', code => {
      if (code !== 0) {
        spawn('rm', [wavFileName]);
        console.log(`openjtalk process exited with code ${code}`);
      } else {
        this.data[str] = wavFileName;
      }
      callback && callback(code);
    });

    return openjtalkProcess;
  }
}

module.exports = OpenJTalk;
