/**
 * Created by Wonseok Jung in KETI on 2021-06-28.
 */

// for TAS of mission
const mqtt = require('mqtt');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { nanoid } = require('nanoid');
const util = require("util");
const os = require('os');

global.sh_man = require('./http_man');

let my_msw_name = 'msw_webrtc_forest';

let config = {};

config.name = my_msw_name;
global.drone_info = '';

try {
    drone_info = JSON.parse(fs.readFileSync('../../drone_info.json', 'utf8'));

    config.directory_name = my_msw_name + '_' + my_msw_name;
    // config.sortie_name = '/' + sortie_name;
    config.gcs = drone_info.gcs;
    config.drone = drone_info.drone;
    config.lib = [];
} catch (e) {
    // config.sortie_name = '';
    config.directory_name = '';
    config.gcs = 'KETI_MUV';
    config.drone = 'FC_MUV_01';
    config.lib = [];
}

// library 추가
let add_lib = {};
try {
    add_lib = JSON.parse(fs.readFileSync('./lib_webrtc_forest.json', 'utf8'));
    config.lib.push(add_lib);
} catch (e) {
    add_lib = {
        name: 'lib_webrtc_forest',
        target: 'armv6',
        description: '[name] [WebRTCpath]',
        scripts: './lib_webrtc_forest gcs.iotocean.org:7598',
        data: [],
        control: ['Control']
    };
    config.lib.push(add_lib);
}

let msw_sub_mobius_topic = [];

let msw_sub_lib_topic = [];

function init() {
    if (config.lib.length > 0) {
        for (let idx in config.lib) {
            if (config.lib.hasOwnProperty(idx)) {
                if (msw_mqtt_client != null) {
                    for (let i = 0; i < config.lib[idx].control.length; i++) {
                        let sub_container_name = config.lib[idx].control[i];
                        let _topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + my_msw_name + '/' + sub_container_name;
                        msw_mqtt_client.subscribe(_topic);
                        local_msw_mqtt_client.subscribe(_topic);
                        msw_sub_mobius_topic.push(_topic);
                        console.log('[msw_mqtt] msw_sub_mobius_topic[' + i + ']: ' + _topic);
                    }

                    for (let i = 0; i < config.lib[idx].data.length; i++) {
                        let container_name = config.lib[idx].data[i];
                        let _topic = '/MUV/data/' + config.lib[idx].name + '/' + container_name;
                        local_msw_mqtt_client.subscribe(_topic);
                        msw_sub_lib_topic.push(_topic);
                        console.log('[lib_mqtt] msw_sub_lib_topic[' + i + ']: ' + _topic);
                    }
                }

                let obj_lib = config.lib[idx];
                setTimeout(runLib, 1000 + parseInt(Math.random() * 10), JSON.parse(JSON.stringify(obj_lib)));
            }
        }
    }
}

function runLib(obj_lib) {
    try {
        let scripts_arr = obj_lib.scripts.split(' ');

        let run_lib = null;

        run_lib = spawn(scripts_arr[0], [scripts_arr[1], drone_info.drone, drone_info.gcs]);

        run_lib.stdout.on('data', function (data) {
            console.log('stdout: ' + data);
        });

        run_lib.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });

        run_lib.on('exit', function (code) {
            console.log('exit: ' + code);
            if (code === null) {
                console.log('code is null');
                run_lib.kill();
            } else {
                // setTimeout(runLib, 3000, obj_lib);
            }
        });

        run_lib.on('error', function (code) {
            console.log('error: ' + code);
        });
    } catch (e) {
        console.log(e.message);
    }
}

let msw_mqtt_client = null;

msw_mqtt_connect(drone_info.host, 1883);

// let webrtc_control_topic = '/Mobius/' + config.lib[0].gcs + '/Mission_Data/' + config.lib[0].drone + '/' + config.name + '/Control';
// let lib_control_topic = '/MUV/control/lib_webrtc_forest/Control';

function msw_mqtt_connect(broker_ip, port) {
    if (msw_mqtt_client === null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'mqttjs_' + config.drone + '_' + my_msw_name + '_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        msw_mqtt_client = mqtt.connect(connectOptions);
    }

    msw_mqtt_client.on('connect', function () {
        console.log('[msw_mqtt_connect] connected to ' + broker_ip);
        let noti_topic = util.format('/oneM2M/req/+/S%s/#', drone_info.id);
        msw_mqtt_client.subscribe(noti_topic, function () {
            console.log('[msw_mqtt_connect] noti_topic is subscribed:  ' + noti_topic);
        });
    });

    msw_mqtt_client.on('message', function (topic, message) {
        if (msw_sub_mobius_topic.includes(topic)) {
            setTimeout(on_receive_from_muv, parseInt(Math.random() * 5), topic, message.toString());
        } else {
            if (topic.includes('/oneM2M/req/')) {
                let jsonObj = JSON.parse(message.toString());

                let patharr = jsonObj.pc['m2m:sgn'].sur.split('/');
                let lib_ctl_topic = '/MUV/control/' + patharr[patharr.length - 3].replace('msw_', 'lib_') + '/' + patharr[patharr.length - 2];

                if (patharr[patharr.length - 3] === my_msw_name) {
                    if (jsonObj.pc['m2m:sgn'].nev) {
                        if (jsonObj.pc['m2m:sgn'].nev.rep) {
                            if (jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']) {
                                let cinObj = jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']
                                if (getType(cinObj.con) == 'string') {
                                    local_msw_mqtt_client.publish(lib_ctl_topic, cinObj.con);
                                } else {
                                    local_msw_mqtt_client.publish(lib_ctl_topic, JSON.stringify(cinObj.con));
                                }
                            }
                        }
                    }
                }
            } else {
            }
        }
    });

    msw_mqtt_client.on('error', function (err) {
        console.log(err.message);
    });
}

let local_msw_mqtt_client = null;

local_msw_mqtt_connect('localhost', 1883);

function local_msw_mqtt_connect(broker_ip, port) {
    if (local_msw_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'local_msw_mqtt_client_mqttjs_' + config.drone + '_' + my_msw_name + '_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        local_msw_mqtt_client = mqtt.connect(connectOptions);

        local_msw_mqtt_client.on('connect', function () {
            console.log('[local_msw_mqtt_connect] connected to ' + broker_ip);
        });

        local_msw_mqtt_client.on('message', function (topic, message) {
            for (let idx in msw_sub_lib_topic) {
                if (msw_sub_lib_topic.hasOwnProperty(idx)) {
                    if (topic === msw_sub_lib_topic[idx]) {
                        setTimeout(on_receive_from_lib, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
        });

        local_msw_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function on_receive_from_muv(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseControlMission(topic, str_message);
}

function on_receive_from_lib(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message + '\n');

    parseDataMission(topic, str_message);
}

function on_process_fc_data(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message + '\n');

    let topic_arr = topic.split('/');
    try {
        fc[topic_arr[topic_arr.length - 1]] = JSON.parse(str_message.toString());
    } catch (e) {
    }

    parseFcData(topic, str_message);
}

setTimeout(init, 1000);

// 유저 디파인 미션 소프트웨어 기능
///////////////////////////////////////////////////////////////////////////////
function parseDataMission(topic, str_message) {
    try {
        // let obj_lib_data = JSON.parse(str_message);
        // if (fc.hasOwnProperty('global_position_int')) {
        //     Object.assign(obj_lib_data, JSON.parse(JSON.stringify(fc['global_position_int'])));
        // }
        // str_message = JSON.stringify(obj_lib_data);

        let topic_arr = topic.split('/');
        let data_topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + topic_arr[topic_arr.length - 1];
        msw_mqtt_client.publish(data_topic, str_message);
        sh_man.crtci(data_topic + '?rcn=0', 0, str_message, null, function (rsc, res_body, parent, socket) {
        });
    } catch (e) {
        console.log('[parseDataMission] data format of lib is not json');
    }
}

///////////////////////////////////////////////////////////////////////////////

function parseControlMission(topic, str_message) {
    try {
        let topic_arr = topic.split('/');
        let _topic = '/MUV/control/' + config.lib[0].name + '/' + topic_arr[topic_arr.length - 1];
        local_msw_mqtt_client.publish(_topic, str_message);
    } catch (e) {
        console.log('[parseControlMission] data format of lib is not json');
    }
}

function parseFcData(topic, str_message) {
    // let topic_arr = topic.split('/');
    // if (topic_arr[topic_arr.length - 1] === 'system_time') {
    //     let _topic = '/MUV/control/' + config.lib[0].name + '/' + config.lib[0].control[0]; // 'system_time'
    //     local_msw_mqtt_client.publish(_topic, str_message);
    // } else if (topic_arr[topic_arr.length - 1] === 'timesync') {
    //     let _topic = '/MUV/control/' + config.lib[0].name + '/' + config.lib[0].control[1]; // 'timesync'
    //     local_msw_mqtt_clint.publish(_topic, str_message);
    // } else {
    // }
}
