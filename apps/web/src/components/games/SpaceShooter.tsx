import React, { useEffect, useRef, useState } from "react";

export default function SpaceShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const keysRef = useRef<Record<string,boolean>>({});
  const [stats, setStats] = useState({score:0,lives:3,level:1,dead:false});

  useEffect(()=>{
    const canvas=canvasRef.current!; const ctx=canvas.getContext("2d")!;
    const W=canvas.width, H=canvas.height;
    let score=0,lives=3,level=1,dead=false;
    let player={x:W/2,y:H-60,w:28,h:36};
    let bullets:any[]=[],enemies:any[]=[],stars:any[]=[],particles:any[]=[];
    let shootCooldown=0,enemyTimer=0,t=0;

    // Stars
    for(let i=0;i<60;i++) stars.push({x:Math.random()*W,y:Math.random()*H,s:Math.random()*2+0.5,spd:1+Math.random()*2});

    function spawnEnemy(){
      const tp=Math.random()<0.7?'basic':Math.random()<0.6?'fast':'tank';
      enemies.push({x:20+Math.random()*(W-40),y:-30,w:24,h:24,tp,
        hp:tp==='tank'?3:1, spd:tp==='fast'?3+level*0.3:1.5+level*0.2,
        shootTimer:Math.random()*120});
    }

    function shoot(x:number,y:number,vy:number,color:string,isPlayer:boolean){
      bullets.push({x,y,vy,color,player:isPlayer,w:4,h:10});
    }

    function burst(x:number,y:number,color:string){
      for(let i=0;i<8;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:30,color});
    }

    function update(){
      t++;
      if(dead) return;
      // Player move
      const spd=4;
      if(keysRef.current['ArrowLeft']||keysRef.current['KeyA']) player.x=Math.max(player.w/2,player.x-spd);
      if(keysRef.current['ArrowRight']||keysRef.current['KeyD']) player.x=Math.min(W-player.w/2,player.x+spd);
      if(keysRef.current['ArrowUp']||keysRef.current['KeyW']) player.y=Math.max(player.h/2,player.y-spd);
      if(keysRef.current['ArrowDown']||keysRef.current['KeyS']) player.y=Math.min(H-player.h/2,player.y+spd);

      // Auto-shoot
      shootCooldown--;
      if(shootCooldown<=0){ shoot(player.x,player.y-20,-10,'#38bdf8',true); shootCooldown=18; }

      // Enemies
      enemyTimer++;
      if(enemyTimer>Math.max(60-level*5,20)){ spawnEnemy(); enemyTimer=0; }
      if(t%600===0){ level++; }

      enemies.forEach(e=>{
        e.y+=e.spd;
        e.shootTimer--;
        if(e.shootTimer<=0){ shoot(e.x,e.y+12,4,'#f97316',false); e.shootTimer=60+Math.random()*60; }
      });
      enemies=enemies.filter(e=>e.y<H+50);

      bullets.forEach(b=>b.y+=b.vy);
      bullets=bullets.filter(b=>b.y>-20&&b.y<H+20);

      particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;});
      particles=particles.filter(p=>p.life>0);

      stars.forEach(s=>{s.y+=s.spd; if(s.y>H){s.y=0;s.x=Math.random()*W;}});

      // Collisions
      bullets.filter(b=>b.player).forEach(b=>{
        enemies.forEach(e=>{
          if(Math.abs(b.x-e.x)<e.w&&Math.abs(b.y-e.y)<e.h){
            e.hp--; b.y=-100;
            if(e.hp<=0){ burst(e.x,e.y,'#f59e0b'); e.y=H+100; score+=e.tp==='tank'?30:10; level=Math.floor(score/200)+1; }
          }
        });
      });

      bullets.filter(b=>!b.player).forEach(b=>{
        if(Math.abs(b.x-player.x)<player.w&&Math.abs(b.y-player.y)<player.h){
          b.y=H+100; lives--; burst(player.x,player.y,'#ef4444');
          if(lives<=0){ dead=true; }
        }
      });

      enemies.forEach(e=>{
        if(Math.abs(e.x-player.x)<(e.w+player.w)/2&&Math.abs(e.y-player.y)<(e.h+player.h)/2){
          lives--; e.y=H+100; burst(player.x,player.y,'#ef4444');
          if(lives<=0) dead=true;
        }
      });

      setStats({score,lives,level,dead});
    }

    function draw(){
      ctx.fillStyle='#030712'; ctx.fillRect(0,0,W,H);

      // Stars
      stars.forEach(s=>{ctx.fillStyle=`rgba(255,255,255,${0.3+s.s*0.2})`; ctx.fillRect(s.x,s.y,s.s,s.s);});

      // Bullets
      bullets.forEach(b=>{ctx.fillStyle=b.color; ctx.fillRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h);});

      // Enemies
      enemies.forEach(e=>{
        ctx.fillStyle=e.tp==='tank'?'#dc2626':e.tp==='fast'?'#a855f7':'#f97316';
        ctx.beginPath();ctx.moveTo(e.x,e.y-e.h/2);ctx.lineTo(e.x+e.w/2,e.y+e.h/2);ctx.lineTo(e.x-e.w/2,e.y+e.h/2);ctx.closePath();ctx.fill();
      });

      // Player
      ctx.fillStyle='#38bdf8';
      ctx.beginPath();ctx.moveTo(player.x,player.y-player.h/2);ctx.lineTo(player.x+player.w/2,player.y+player.h/2);ctx.lineTo(player.x-player.w/2,player.y+player.h/2);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(56,189,248,0.3)'; ctx.beginPath(); ctx.arc(player.x,player.y+player.h/4,player.w/2,0,Math.PI*2); ctx.fill();

      // Particles
      particles.forEach(p=>{ctx.globalAlpha=p.life/30; ctx.fillStyle=p.color; ctx.fillRect(p.x-2,p.y-2,4,4);});
      ctx.globalAlpha=1;

      if(dead){
        ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
        ctx.fillStyle='white'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center';
        ctx.fillText('Game Over!',W/2,H/2-20);
        ctx.fillText(`Score: ${score} | Lvl: ${level}`,W/2,H/2+20);
        ctx.fillStyle='#38bdf8'; ctx.font='16px sans-serif';
        ctx.fillText('Press Space to restart',W/2,H/2+55);
      }
    }

    function loop(){ update(); draw(); rafRef.current=requestAnimationFrame(loop); }
    rafRef.current=requestAnimationFrame(loop);

    const onKey=(e:KeyboardEvent)=>{
      keysRef.current[e.code]=e.type==='keydown';
      if(e.code==='Space'&&dead){score=0;lives=3;level=1;dead=false;bullets=[];enemies=[];}
    };
    window.addEventListener('keydown',onKey); window.addEventListener('keyup',onKey);

    // Touch
    canvas.addEventListener('pointermove',e=>{ const r=canvas.getBoundingClientRect(); const touchX=(e.clientX-r.left)*(W/r.width); player.x=Math.max(player.w/2,Math.min(W-player.w/2,touchX)); });
    canvas.addEventListener('pointerdown',()=>{ if(dead){score=0;lives=3;level=1;dead=false;bullets=[];enemies=[];} });

    return ()=>{ cancelAnimationFrame(rafRef.current); window.removeEventListener('keydown',onKey); window.removeEventListener('keyup',onKey); };
  },[]);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:"#030712",padding:12,borderRadius:12}}>
      <div style={{color:"white",display:"flex",gap:20,fontSize:13}}>
        <span>Score: <b style={{color:"#facc15"}}>{stats.score}</b></span>
        <span>{"❤️".repeat(Math.max(0,stats.lives))}</span>
        <span>Level: <b style={{color:"#a78bfa"}}>{stats.level}</b></span>
      </div>
      <canvas ref={canvasRef} width={340} height={420} style={{borderRadius:10}} />
      <p style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>Arrow keys / WASD to move · Auto-fires · Space to restart</p>
    </div>
  );
}
