class callData {
    constructor() {
        this.callLog = new Array();
    }

    addCall(CALL, STREAMELEM, OUTDIR) {
        if (OUTDIR == 'in')
            this.callLog.push({ call: CALL, streamElem: STREAMELEM, callID: OUTDIR });
        else {
            var ce = this.callIDexists(OUTDIR);
            if (ce != -1) {
                try {
                    this.callLog[ce].call.close();
                    this.callLog[ce].streamElem.pause();
                    this.callLog[ce].streamElem.parentNode.removeChild(this.callLog[ce].streamElem);
                    this.callLog[ce].streamElem = null;
                } catch (e) { };
                this.callLog[ce].call = CALL;
                this.callLog[ce].streamElem = STREAMELEM;
            }
            else
                this.callLog.push({ call: CALL, streamElem: STREAMELEM, callID: OUTDIR });
        }
    }

    callIDexists(ID) {
        for (var i = 0; i < this.callLog.length; i++)
            if (this.callLog[i].callID == ID)
                return i;
        return -1;
    }

    mute(ID, MUTE) {
        var ce = this.callIDexists(ID);
        if (ce != -1)
            this.callLog[ce].streamElem.muted = MUTE;
        else
            console.log('Mute failed: ' + ID);
    }

    destroyAll() {
        for (var i = 0; i < this.callLog.length; i++)
            try {
                this.callLog[i].call.close();
                this.callLog[i].streamElem.pause();
                this.callLog[i].streamElem.parentNode.removeChild(this.callLog[i].streamElem);
                this.callLog[i].streamElem = null;
            }
            catch (e) {
                console.log('Error destroying call: ' + e);
            }
    }
}

class audioChat {
    constructor(socketLinkText = 'adc', audioOnly = false, host = document.location.host, port = 443, path = '/voice') {
        this.socketLink = socketLinkText;
        this.myID = '';
        this.roomID = '';
        this.host = host;
        this.port = port;
        this.path = path;
        this.existingCalls = new callData(); //array of callData
        this.audioOnly = audioOnly;
        this.myPeer = '';
    }

    registerID() {
        socket.emit(this.socketLink, { id: this.roomID, cid: this.cID, op: 'conn' });
    }

    init(roomid, callerid) {
        this.roomID = roomid;
        this.cID = callerid;
        this.myID = roomid + callerid;
        try {
            this.myPeer = new Peer(this.myID, { host: this.host, port: this.port, path: this.path });
            this.registerID();

            var vidEnable = !this.audioOnly;
            var eCalls = this.existingCalls;
            this.myPeer.on('call', async function (call) {
                var streamElem = document.createElement(vidEnable ? 'video' : 'audio');
                streamElem.autoplay = true;
                streamElem.volume = 1;
                document.body.appendChild(streamElem);
                await navigator.mediaDevices.getUserMedia({ video: vidEnable, audio: true }).then(
                    function (stream) {
                        console.log('Incoming call: ' + call.peer);
                        call.answer(stream); // Answer the call with an A/V stream.
                        call.on('stream',
                            function (remoteStream) {
                                streamElem.srcObject = remoteStream;
                            });
                        eCalls.addCall(call, streamElem , call.peer);
                    }).catch(
                        function (err) {
                            console.log('Failed to get local stream: ', err);
                        });
            });
        } catch (e) {
            console.log('Error opening peer: ' + e);
        }
    }

    async socketCallback(data) { //data.cid - person who should call, data.calls - people he should call
        if (data.cid != this.myID) // not my turn to call
            return;

        var vidEnable = !this.audioOnly;
        var peer = this.myPeer;
        var eCalls = this.existingCalls;
        for (var i = 0; i < data.calls.length; i++) {
            if (data.calls[i] == this.myID) // self call not necessary
                continue;

            var callNow = data.calls[i];
            await navigator.mediaDevices.getUserMedia({ video: vidEnable, audio: true }).then(
                function (stream) {
                    var streamElem = document.createElement(vidEnable ? 'video' : 'audio');
                    streamElem.autoplay = true;
                    streamElem.volume = 1;
                    document.body.appendChild(streamElem);
                    var call = peer.call(callNow, stream);
                    console.log('Calling: ' + callNow);
                    call.on('stream',
                        function (remoteStream) {
                            streamElem.srcObject = remoteStream;
                        });
                    eCalls.addCall(call, streamElem, call.peer);
                }).catch(
                    function (err) {
                        console.log('Failed to get local stream: ', err);
                    });
        }
    }

    mute(ID, CID, MUTE) {
        this.existingCalls.mute(ID + CID, MUTE);
    }

    disconnect() {
        try {
            this.existingCalls.destroyAll();
        }
        catch (e) {
            console.log('Error disconnecting: ' + e);
        }
    }

    endSession() {
        socket.emit(this.socketLink, { id: this.roomID, cid: this.cID, op: 'del' });
        this.disconnect();
    }
};

var chatServer = 'vsins29.herokuapp.com';
var port = document.location.protocol == 'http:' ? 80 : 443;
var path = '/voice';
var audioOnly = true;
var socketText = 'adc';
var voiceChat = new audioChat(socketText, audioOnly, chatServer, port, path);
var streamRunning = false;

function startVoice(ID, CID) {
    voiceChat.init(ID, CID);
    streamRunning = true;
}
function reconnectVoice(ID, CID) {
    streamRunning = false;
    try {
        voiceChat.disconnect();
        voiceChat.myPeer.destroy();
    } catch (e) { };
    voiceChat = new audioChat(socketText, audioOnly, chatServer, port, path);
    setTimeout(function () {
        startVoice(ID, CID);
    }, 2000);
}
function endVoice() {
    streamRunning = false;
    try {
        voiceChat.endSession();
        voiceChat.myPeer.destroy();
    } catch (e) { };
}
function changeMuteVoice(ID, CID, MUTE) {
    voiceChat.mute(ID, CID, MUTE);
}
socket.on(socketText, function (data) {
    if (streamRunning)
        setTimeout(function(){voiceChat.socketCallback(data);},1000);
});