const schemas={
HAD:[["fullNameStatic","Фамилия Имя | Статик",1],["reprimandsIssued","Выданные выговоры",1],["reprimandsWorked","Проверенные отработки выговоров",1],["chartersAccepted","Принятые уставы",1],["reattestationsAccepted","Принятые переаттестации сотрудников",1],["supervision","Надзорная деятельность",1],["briefings","Проведённые брифинги",1],["firstAid","Оказание ПМП",1],["tabletsIssued","Выданные таблетки",1],["vaccinesIssued","Выданные вакцины",1]],
DI:[["fullNameStatic","Имя Фамилия | Статик",1],["joinDate","Дата вступления в EMS",1,"date"],["interviews","Собеседования (ссылка | количество)",1],["reportsChecked","Проверенные отчеты (ссылка | количество)",1],["lecturesChecked","Проверенный лекции (ссылка | количество)",1],["govWaves","Гос. волны (ссылка | количество)",1],["vaccines","Вакцины (ссылка | количество)",0],["firstAid","ПМП (ссылка | количество)",0],["tablets","Таблетки (ссылка | количество)",0],["medCards","Мед. карты (ссылка | количество)",0]],
PM:[["fullName","Имя Фамилия",1],["staticId","Статик",1],["joinDate","Дата вступления в EMS",1,"date"],["firstAid","ПМП (ссылка | количество)",1],["vaccines","Вакцины (ссылка | количество)",1],["tablets","Таблетки (ссылка | количество)",1]],
EMT:[["fullNameStatic","Имя Фамилия | Статик",1],["joinDate","Дата вступления в EMS",1,"date"],["firstAid","ПМП (ссылка | количество)",1],["vaccines","Вакцины (ссылка | количество)",1],["tablets","Таблетки (ссылка | количество)",1],["medCards","Выдача мед. карт. (ссылка | количество)",0],["supply","МП | ГМП | Поставки (ссылка | количество)",0]],
SD:[["fullNameStatic","Имя Фамилия | Статик",1],["joinDate","Дата вступления в EMS",1,"date"],["firstAid","ПМП (ссылка | количество)",0],["vaccines","Вакцины (ссылка | количество)",0],["tablets","Таблетки (ссылка | количество)",1],["medCards","Мед. карты (ссылка | количество)",1],["operations","Операции (ссылка из канала ds)",1],["rpTests","RP-тесты (ссылка из канала ds)",1]],
PSED:[["fullNameStatic","Имя Фамилия | Статик",1],["joinDate","Дата вступления в EMS",1,"date"],["medCards","Мед. карты (ссылка | количество)",1],["checks","Проверки (ссылка | количество)",1],["tablets","Таблетки (ссылка | количество)",0],["vaccines","Вакцины (ссылка | количество)",0],["firstAid","ПМП (ссылка | количество)",0]],
SENIOR:[["sender","Отправитель (Имя Фамилия | Статик)",1],["firstAid","ПМП (ссылка | количество)",0],["vaccines","Вакцина (ссылка | количество)",0],["tablets","Таблетки (ссылка | количество)",0],["medCards","Выдача мед. карт (ссылка | количество)",0],["promotions","Повышение сотрудников (ссылка | количество)",0],["resignations","Увольнение сотрудников (ссылка | количество)",0],["promotionChecks","Проверка отчетов на повышение (ссылка | количество)",0],["promotionInChecks","Проверка отчетов на повышение IN (ссылка | количество)",0],["stateChecks","Проверка гос.структур (PSED) (ссылка | количество)",0],["interviews","Собеседования (ссылка | количество)",0],["govWaves","Гос. Волны (ссылка | количество)",0],["lectures","Лекции (ссылка | количество)",0],["reattestations","Переаттестации (ссылка | количество)",0],["supply","МП / ГМП / Поставка (ссылка | количество)",0],["briefings","Брифинги (ссылка | количество)",0]]
};

const department=document.getElementById("department");
const rank=document.getElementById("rank");
const dynamic=document.getElementById("dynamic");
const fields=document.getElementById("fields");
const submitWrap=document.getElementById("submitWrap");
const title=document.getElementById("title");
const badge=document.getElementById("badge");
const hint=document.getElementById("hint");

department.addEventListener("change",()=>{
  rank.disabled=!department.value;
  rank.value="";
  rank.options[0].textContent=department.value?"Выберите ранг":"Сначала выберите отдел";
  render();
});

rank.addEventListener("change",render);

function render(){
  const dep=department.value;
  const r=Number(rank.value);

  if(!dep||!r){
    dynamic.hidden=true;
    submitWrap.hidden=true;
    hint.hidden=true;
    fields.innerHTML="";
    return;
  }

  const senior=r>=11;
  const current=schemas[senior?"SENIOR":dep];

  title.textContent=senior?"2. Недельный отчёт старшего состава":`2. Недельный отчёт ${dep}`;
  badge.textContent=senior?`HS • ${r} ранг`:`${dep} • ${r} ранг`;

  hint.hidden=false;
  hint.innerHTML=senior
    ? "<strong>Старший состав</strong><span>Отчёт уйдёт в общий канал старшего состава с упоминанием главного врача и заместителя.</span>"
    : `<strong>Отдел ${dep}</strong><span>Отчёт уйдёт в канал отдела с упоминанием заведующего и заместителя.</span>`;

  fields.innerHTML="";
  current.forEach(([name,label,required,type="text"])=>{
    const l=document.createElement("label");
    const s=document.createElement("span");
    s.innerHTML=label+(required?' <b>*</b>':'');
    const input=document.createElement("input");
    input.type=type;
    input.name=name;
    input.required=Boolean(required);
    if(type!=="date") input.placeholder="Введите данные";
    l.append(s,input);
    fields.appendChild(l);
  });

  dynamic.hidden=false;
  submitWrap.hidden=false;
}
