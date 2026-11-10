// Servidor de salas para el Modo Carrera.  Uso:  npm i ws  &&  node server.js
// Sirve public/index.html y un WebSocket en /ws (relay de mensajes entre los jugadores de una sala).
const http=require("http"),fs=require("fs"),path=require("path"),{WebSocketServer}=require("ws");
const PORT=process.env.PORT||3000,MAX=8,CH="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const server=http.createServer((req,res)=>{fs.readFile(path.join(__dirname,"public","index.html"),(e,d)=>{
 if(e){res.writeHead(404);return res.end("404")}res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(d)})});
const wss=new WebSocketServer({server,path:"/ws"}),rooms=new Map();let nid=1;
const send=(ws,o)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
wss.on("connection",ws=>{
 ws.id="P"+(nid++);ws.alive=true;ws.on("pong",()=>ws.alive=true);
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="create"){
   let c;do{c=Array.from({length:6},()=>CH[Math.random()*CH.length|0]).join("")}while(rooms.has(c));
   rooms.set(c,{host:ws,peers:new Map([[ws.id,ws]])});ws.room=c;send(ws,{type:"created",code:c,id:ws.id});
  }else if(m.type==="join"){
   const code=String(m.code||"").toUpperCase(),r=rooms.get(code);
   if(!r)return send(ws,{type:"error",error:"NOT_FOUND"});
   if(r.peers.size>=MAX)return send(ws,{type:"error",error:"FULL"});
   r.peers.set(ws.id,ws);ws.room=code;send(ws,{type:"joined",id:ws.id,hostId:r.host.id});send(r.host,{type:"peer_join",id:ws.id});
  }else if(m.type==="relay"){
   const r=rooms.get(ws.room);if(!r)return;const out={type:"msg",from:ws.id,data:m.data};
   if(m.to==="host"){if(ws!==r.host)send(r.host,out)}
   else if(m.to==="all"){r.peers.forEach(p=>{if(p!==ws)send(p,out)})}
   else send(r.peers.get(m.to),out);
  }
 });
 ws.on("close",()=>{
  const r=rooms.get(ws.room);if(!r)return;
  if(r.host===ws){r.peers.forEach(p=>{if(p!==ws)send(p,{type:"closed",reason:"HOST_LEFT"})});rooms.delete(ws.room)}
  else{r.peers.delete(ws.id);send(r.host,{type:"peer_leave",id:ws.id})}
 });
});
setInterval(()=>wss.clients.forEach(ws=>{if(!ws.alive)return ws.terminate();ws.alive=false;ws.ping()}),30000);
server.listen(PORT,()=>console.log("Servidor en http://localhost:"+PORT));
