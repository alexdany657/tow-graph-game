#!/bin/node

var ws=require("ws");
var server=new ws.WebSocketServer({port:5705})

var rooms={},enforceHost=false;

var joinRE=/^join (?<key>[A-Za-z0-9]+) (?<name>[A-Za-z0-9]+)$/,leaveRE=/^leave$/,updateRE=/^update (?<data>{.+})$/,
moveRE=/^move$/,startRE=/^start$/;

function roomToSend(key) {
return { players: rooms[key].players, pos: rooms[key].pos, movePos: rooms[key].movePos,
playerPos: rooms[key].playerPos, roundNum: rooms[key].roundNum, roundMax: rooms[key].roundMax, p: rooms[key].p,
gameOver: rooms[key].gameOver, gameStarted: rooms[key].gameStarted, playersList: rooms[key].playersList, }; }

function sendRoom(key,full) {
if (!(key in rooms)) return;
var toSend=roomToSend(key);
if (rooms[key].gameOver) toSend.log=rooms[key].log;
if (full) toSend.fieldDesc=rooms[key].fieldDesc;
rooms[key].conns.forEach(function(conn) { conn.send("room "+this, { binary: false, } ); }, JSON.stringify(toSend)); }

function prepSucc(key,suc) { return "succ "+rooms[key].pos+" "+rooms[key].movePos+" "+(suc?1:0); }

function sendSucc(key,msg) {
rooms[key].conns.forEach(function(conn) { conn.send(this, { binary: false, }); }, msg); }

function sendMessage(client, msg) { client.send(msg, { binary: false, }); }

function leaveRoom(client,client_key,client_name) {
if (client_key!=null) {
var key=client_key;
var ind=rooms[key].players.indexOf(client_name);
rooms[key].players.splice(ind,1); sendRoom(key); rooms[key].conns.splice(ind,1); } }

function nextTurn(key) {
rooms[key].playerPos++; if (rooms[key].playerPos==rooms[key].playersList.length) {
rooms[key].playerPos=0; rooms[key].roundNum++; }
if (rooms[key].roundNum==rooms[key].roundMax) rooms[key].gameOver=true; sendRoom(key); }

server.on("connection", function(client) {
var client_key=null,client_name="";
client.on("close", function() {
leaveRoom(client,client_key,client_name); client_key=null; client_name=""; });
client.on("message", function(message) {
message=message+"";
console.debug({key:client_key,name:client_name,message:message});
if (joinRE.test(message)) {
if (client_key!=null) { sendMessage(client,"error Already in a room!"); return; }
var gr=joinRE.exec(message).groups;
var key=gr.key,name=gr.name;
if (!(key in rooms)) rooms[key]={
conns: [], fieldDesc: "", players: [], pos: null, movePos: null, playerPos: -1, roundNum: 0, roundMax: null, p: 0.5,
gameOver: false, gameStarted: false, playersList: [], log: [], };
if (rooms[key].players.indexOf(name)!=-1) { sendMessage(client,"error Name already used!"); return; }
rooms[key].conns.push(client); rooms[key].players.push(name);
client_key=key; client_name=name; sendRoom(key,true); return; }
if (leaveRE.test(message)) {
if (client_key==null) { sendMessage(client,"error Not in a room!"); return; }
leaveRoom(client,client_key,client_name); client_key=null; client_name=""; return; }
if (updateRE.test(message)) {
if (client_key==null) { sendMessage(client,"error Not in a room!"); return; }
var key=client_key,data=JSON.parse(updateRE.exec(message).groups.data);
console.log(data);
for (var i=0;i<Object.keys(data);++i) if (!(Object.keys(data)[i] in rooms[key])) {
sendMessage(client, "error Bad key: "+Object.keys(data)[i]); return; }
if (rooms[key].gameOver) { sendMessage(client,"error game ended, can't update!"); return; }
if ("fieldDesc" in data) {
if (rooms[key].players.indexOf(client_name)!=0&&enforceHost) {
sendMessage(client,"error Not the host to update fieldDesc!"); return; }
if (rooms[key].gameStarted) {
sendMessage(client,"error Game already started!"); return; } }
if ("playersList" in data) {
if (rooms[key].players.indexOf(client_name)!=0&&enforceHost) {
sendMessage(client,"error Not the host to update playersList!"); return; }
if (rooms[key].gameStarted) {
sendMessage(client,"error Game already started!"); return; } }
if ("roundMax" in data) {
if (rooms[key].players.indexOf(client_name)!=0&&enforceHost) {
sendMessage(client,"error Not the host to update p!"); return; }
if (rooms[key].gameStarted) {
sendMessage(client,"error Game already started!"); return; } }
if ("p" in data) {
if (rooms[key].players.indexOf(client_name)!=0&&enforceHost) {
sendMessage(client,"error Not the host to update roundMax!"); return; }
if (rooms[key].gameStarted) {
sendMessage(client,"error Game already started!"); return; } }
if ("roundNum" in data) { sendMessage(client,"error roundNum is readonly!"); return; }
if ("playerPos" in data) { sendMessage(client,"error playerPos is readonly!"); return; }
if ("gameOver" in data) { sendMessage(client,"error gameOver is readonly!"); return; }
if ("gameStarted" in data) { sendMessage(client,"error gameStarted is readonly!"); return; }
if ("players" in data) { sendMessage(client,"error players is readonly!"); return; }
if ("pos" in data) {
if (rooms[key].players.indexOf(client_name)!=0&&enforceHost) {
sendMessage(client,"error Not the host to update pos!"); return; }
if (rooms[key].gameStarted) { sendMessage(client,"error pos is readonly after game started!"); return; } }
if ("movePos" in data) {
if (!rooms[key].gameStarted) { sendMessage(client,"error game not started, can't change movePos!"); return; }
if (rooms[key].playersList[rooms[key].playerPos]!=client_name) {
sendMessage(client,"error It's not your turn, can't change movePos!"); return; } }
if ("fieldDesc" in data) rooms[key].fieldDesc=data.fieldDesc;
if ("playersList" in data) rooms[key].playersList=data.playersList;
if ("roundMax" in data) rooms[key].roundMax=data.roundMax;
if ("p" in data) rooms[key].p=data.p;
if ("pos" in data) rooms[key].pos=data.pos;
if ("movePos" in data) rooms[key].movePos=data.movePos;
if ("fieldDesc" in data) sendRoom(key,true); else sendRoom(key); return; }
if (moveRE.test(message)) {
if (client_key==null) { sendMessage(client,"error Not in room!"); return; }
var key=client_key;
if (rooms[key].gameOver) { sendMessage(client,"error Game ended, can't move!"); return; }
if (!rooms[key].gameStarted) { sendMessage(client,"error Game not started, can't move!"); return; }
if (rooms[key].playersList[rooms[key].playerPos]!=client_name) {
sendMessage(client,"error It's not your turn!"); return; }
var val=Math.random(); console.log(key,rooms[key].pos,rooms[key].movePos,val);
rooms[key].log.push([rooms[key].pos,rooms[key].movePos,val<rooms[key].p]);
var succMsg=prepSucc(key,val<rooms[key].p); if (val<rooms[key].p) rooms[key].pos=rooms[key].movePos;
rooms[key].movePos=null; nextTurn(key); sendSucc(key,succMsg); return; }
if (startRE.test(message)) {
if (client_key==null) { sendMessage(client,"error Not in room!"); return; }
var key=client_key;
if (rooms[key].gameStarted) { sendMessage(client,"error Game already started!"); return; }
rooms[key].gameStarted=true; nextTurn(key); return; }
sendMessage(client,"error Unrecognized command!");
}); });
