// JavaScript-only game controller for the Sek Sek layout.
const BOARD_POINTS = [[.4885,.9139],[.4732,.7505],[.4855,.5893],[.2374,.4281],[.755,.4303],[.5069,.2647],[.2435,.0948],[.755,.1013]];
const QUESTIONS = [
  {text:"Türkiye'nin başkenti hangisidir?", answers:["İstanbul","Ankara","İzmir","Bursa"], correct:1},
  {text:"2 + 3 kaç eder?", answers:["4","5","6","7"], correct:1},
  {text:"Bir haftada kaç gün vardır?", answers:["5","6","7","8"], correct:2},
  {text:"Su kaç derecede donar?", answers:["0°C","10°C","50°C","100°C"], correct:0}
];

export class SekSekGame {
  constructor(runtime) {
    this.runtime=runtime; this.board=runtime.objects.seksek_game?.getFirstInstance();
    this.stone=runtime.objects.tas?.getFirstInstance(); this.throwButton=runtime.objects.btn_tas_at?.getFirstInstance();
    this.leftFoot=runtime.objects.sol_ayak?.getFirstInstance(); this.rightFoot=runtime.objects.sag_ayak?.getFirstInstance();
    this.score=0; this.target=0; this.hop=-1; this.dragging=false; this.questionIndex=0;
    const dragDrop=this.stone?.behaviors?.DragDrop; if(dragDrop) dragDrop.isEnabled=false;
    this.originalStonePosition={x:this.stone?.x??1319,y:this.stone?.y??986};
    this.createHud(); this.bindInput(); this.resetRound();
  }
  point(i) { if (!this.board) return {x:960,y:700}; const [x,y]=BOARD_POINTS[i]; return {x:this.board.x-this.board.width*this.board.originX+x*this.board.width,y:this.board.y-this.board.height*this.board.originY+y*this.board.height}; }
  createHud() {
    const canvas=this.runtime.canvas; if (!canvas?.parentElement) return; const parent=canvas.parentElement; parent.style.position ||= "relative";
    this.hud=document.createElement("div"); this.hud.id="seksek-js-hud"; this.hud.style.cssText="position:absolute;inset:0;z-index:20;pointer-events:none;font-family:Arial,sans-serif;";
    this.hud.innerHTML='<div data-role="status" style="position:absolute;left:50%;top:3%;transform:translateX(-50%);padding:10px 22px;border-radius:16px;background:rgba(23,37,84,.88);color:#fff;font-size:22px;font-weight:700;text-align:center;min-width:320px"></div><div data-role="score" style="position:absolute;right:5%;top:5%;padding:10px 18px;border-radius:14px;background:rgba(255,255,255,.88);color:#172554;font-size:22px;font-weight:800"></div><div data-role="question" style="display:none;pointer-events:auto;position:absolute;left:10%;right:10%;top:25%;padding:28px;border-radius:24px;background:#fff;box-shadow:0 12px 40px #0005;color:#172554;text-align:center"><div data-role="questionText" style="font-size:26px;font-weight:800;margin-bottom:20px"></div><div data-role="answers" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div></div>';
    parent.appendChild(this.hud); this.statusEl=this.hud.querySelector('[data-role="status"]'); this.scoreEl=this.hud.querySelector('[data-role="score"]'); this.questionEl=this.hud.querySelector('[data-role="question"]'); this.updateScore();
  }
  bindInput() {
    this.runtime.addEventListener("pointerdown",e=>this.pointerDown(e)); this.runtime.addEventListener("pointermove",e=>this.pointerMove(e)); this.runtime.addEventListener("pointerup",()=>this.pointerUp());
    document.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="a")this.hopWithFoot("left");if(e.key==="ArrowRight"||e.key==="d"||e.key===" ")this.hopWithFoot("right");});
  }
  layoutPoint(e) { const r=this.runtime.getCanvasClientRect?.(); return r?{x:(e.clientX-r.left)*1920/r.width,y:(e.clientY-r.top)*1080/r.height}:{x:e.clientX,y:e.clientY}; }
  hit(o,p) { return o&&typeof o.containsPoint==="function"&&o.containsPoint(p.x,p.y); }
  pointerDown(e) { const p=this.layoutPoint(e); if(this.questionEl?.style.display==="block")return; if(this.hit(this.throwButton,p)){this.startThrow();return;} if(this.hit(this.leftFoot,p)){this.hopWithFoot("left");return;} if(this.hit(this.rightFoot,p)){this.hopWithFoot("right");return;} if(this.hit(this.stone,p)&&this.hop<0)this.dragging=true; }
  pointerMove(e) { if(!this.dragging||!this.stone)return; const p=this.layoutPoint(e); this.stone.x=p.x; this.stone.y=p.y; }
  pointerUp() { if(!this.dragging)return; this.dragging=false; const p=this.point(this.target); if(Math.hypot(this.stone.x-p.x,this.stone.y-p.y)<=120){this.stone.x=p.x;this.stone.y=p.y;this.hop=0;this.status("Doğru! Ayağı seçerek sekmeye ilerle.");}else this.resetRound("Taş hedefe gitmedi. Tekrar dene."); }
  startThrow() { this.hop=-1; this.stone.x=this.originalStonePosition.x; this.stone.y=this.originalStonePosition.y; this.status(`${this.target+1}. sekmeye taşı sürükle.`); }
  hopWithFoot(side) { if(this.hop<0||this.questionEl?.style.display==="block")return; const expected=this.hop%2===0?"right":"left"; if(side!==expected){this.resetRound("Yanlış ayak! Tur yeniden başlıyor.");return;} this.hop++; if(this.hop>=BOARD_POINTS.length){this.openQuestion();return;} const p=this.point(this.hop); this.status(`${this.hop+1}. sekme`); const foot=side==="right"?this.rightFoot:this.leftFoot; if(foot){foot.x=p.x-(side==="right"?35:-35);foot.y=p.y;} }
  openQuestion() { const q=QUESTIONS[this.questionIndex++%QUESTIONS.length]; this.questionEl.style.display="block"; this.hud.querySelector('[data-role="questionText"]').textContent=q.text; const box=this.hud.querySelector('[data-role="answers"]'); box.replaceChildren(...q.answers.map((a,i)=>{const b=document.createElement("button");b.textContent=`${String.fromCharCode(65+i)}) ${a}`;b.style.cssText="padding:14px;border:0;border-radius:12px;background:#e0e7ff;color:#172554;font-size:18px;font-weight:700;cursor:pointer";b.onclick=()=>this.answer(i===q.correct);return b;})); }
  answer(correct) { this.questionEl.style.display="none"; if(correct){this.score+=10;this.target=(this.target+1)%BOARD_POINTS.length;this.status("Harika! Yeni tur için taşı at.");}else this.status("Cevap yanlış. Yeni tur için taşı at."); this.updateScore(); this.hop=-1; this.stone.x=this.originalStonePosition.x; this.stone.y=this.originalStonePosition.y; }
  resetRound(message="Taşı atmak için butona bas.") { this.dragging=false;this.hop=-1;if(this.stone){this.stone.x=this.originalStonePosition.x;this.stone.y=this.originalStonePosition.y;}this.status(message); }
  status(s){if(this.statusEl)this.statusEl.textContent=s;} updateScore(){if(this.scoreEl)this.scoreEl.textContent=`Puan: ${this.score}`;} tick(){}
}
