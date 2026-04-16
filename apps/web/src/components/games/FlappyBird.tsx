import React, { useEffect, useRef, useState } from "react";

export default function FlappyBird() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<any>({ bird:{y:200,vy:0}, pipes:[] as any[], score:0, best:0, alive:false, started:false, t:0 });
  const rafRef = useRef(0);
  const [display, setDisplay] = useState({score:0,best:0,alive:false,started:false});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W=canvas.width, H=canvas.height;
    const s = stateRef.current;

    const GRAVITY=0.45, JUMP=-7, GAP=120, PIPE_W=50, SPEED=2.5;

    function spawnPipe() {
      const top = 60 + Math.random()*(H-GAP-120);
      s.pipes.push({x:W, top, bottom:top+GAP});
    }

    function reset() {
      s.bird={y:H/2,vy:0}; s.pipes=[]; s.score=0; s.alive=true; s.started=true; s.t=0;
      spawnPipe();
      setDisplay({score:0,best:s.best,alive:true,started:true});
    }

    function flap() {
      if(!s.started||!s.alive) { reset(); return; }
      s.bird.vy=JUMP;
    }

    canvas.addEventListener("pointerdown", flap);

    function draw() {
      if(s.alive && s.started) {
        s.t++;
        s.bird.vy+=GRAVITY; s.bird.y+=s.bird.vy;

        if(s.t%80===0) spawnPipe();
        s.pipes.forEach((p:any)=>p.x-=SPEED);
        s.pipes=s.pipes.filter((p:any)=>p.x>-PIPE_W);

        // Collision
        const bx=80, by=s.bird.y, br=14;
        for(const p of s.pipes){
          if(bx+br>p.x && bx-br<p.x+PIPE_W && (by-br<p.top || by+br>p.bottom)){
            s.alive=false; if(s.score>s.best)s.best=s.score;
            setDisplay({score:s.score,best:s.best,alive:false,started:true});
          }
        }
        if(s.bird.y>H||s.bird.y<0){
          s.alive=false; if(s.score>s.best)s.best=s.score;
          setDisplay({score:s.score,best:s.best,alive:false,started:true});
        }

        if(s.t%Math.round(80/SPEED)===0 && s.alive) {
          s.score++;
          setDisplay({score:s.score,best:s.best,alive:true,started:true});
        }
      }

      // Draw
      const grad=ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0,"#1e3a5f"); grad.addColorStop(1,"#0f172a");
      ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);

      // Ground
      ctx.fillStyle="#4a7c59"; ctx.fillRect(0,H-20,W,20);

      // Pipes
      ctx.fillStyle="#22c55e";
      s.pipes.forEach((p:any)=>{
        ctx.fillRect(p.x,0,PIPE_W,p.top);
        ctx.fillRect(p.x,p.bottom,PIPE_W,H-p.bottom);
        ctx.fillStyle="#16a34a";
        ctx.fillRect(p.x-4,p.top-20,PIPE_W+8,20);
        ctx.fillRect(p.x-4,p.bottom,PIPE_W+8,20);
        ctx.fillStyle="#22c55e";
      });

      // Bird
      const bY = s.bird.y;
      ctx.save(); ctx.translate(80, bY);
      ctx.rotate(Math.min(Math.max(s.bird.vy*0.05,-0.5),0.8));
      ctx.fillStyle="#facc15"; ctx.beginPath(); ctx.arc(0,0,14,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#dc2626"; ctx.fillRect(10,-4,8,5);
      ctx.fillStyle="white"; ctx.beginPath(); ctx.arc(5,-5,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#1e293b"; ctx.beginPath(); ctx.arc(7,-5,3,0,Math.PI*2); ctx.fill();
      ctx.restore();

      // Overlay
      if(!s.started){
        ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(0,0,W,H);
        ctx.fillStyle="white"; ctx.font="bold 26px sans-serif"; ctx.textAlign="center";
        ctx.fillText("Tap to Start!", W/2, H/2);
      } else if(!s.alive){
        ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(0,0,W,H);
        ctx.fillStyle="white"; ctx.font="bold 22px sans-serif"; ctx.textAlign="center";
        ctx.fillText(`Score: ${s.score}`, W/2, H/2-20);
        ctx.fillText("Tap to Retry", W/2, H/2+20);
      }

      rafRef.current=requestAnimationFrame(draw);
    }

    rafRef.current=requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("pointerdown",flap); };
  }, []);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:"#0f172a",padding:16,borderRadius:12}}>
      <div style={{color:"white",display:"flex",gap:24,fontSize:14}}>
        <span>Score: <b style={{color:"#facc15"}}>{display.score}</b></span>
        <span>Best: <b style={{color:"#a78bfa"}}>{display.best}</b></span>
      </div>
      <canvas ref={canvasRef} width={340} height={400} style={{borderRadius:10,cursor:"pointer"}} />
    </div>
  );
}
