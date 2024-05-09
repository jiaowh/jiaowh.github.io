
const names = ["Captain Nightkid", "Maelstrom", "Nirvana"]
const ygonames = ["Egyptian Gods", "New World Formation", "Leviathan", "Hiita", "Havnis", "Exceed The Pendulum"]
const digimonnames = ["Lillymon", "Angewomon", "Faeriemon", "Taomon"]
const games=["vg", "ygo","digi","poke","tcg","others"]
let current_item=0;
let current_game=0;
let count=0;

function left(){

    var a = document.getElementById("left"); 
    a.style.left='0vw';
    setTimeout(function(){a.style.left='3vw';}, 1000);

    if(current_game==0){
        
        vg_left(current_item);
        current_item = (current_item -1+3) % 3;
        document.getElementById("name").innerText = names[current_item];
    }
    else if(current_game==1){
        ygo_left(current_item);
        current_item = (current_item -1+6) % 6;
        document.getElementById("ygoname").innerText = ygonames[current_item];
    }
    else if(current_game==2){
        digi_left(current_item);
        current_item = (current_item -1+6) % 6;
        document.getElementById("diginame").innerText = digimonnames[current_item];
    }
    
}

function right(){

    var a = document.getElementById("right"); 
    a.style.right='-3vw';
    setTimeout(function(){a.style.right='0vw';}, 1000);

    if(current_game==0){
        vg_right(current_item);
        current_item = (current_item + 1) % 3;
        document.getElementById("name").innerText = names[current_item];}

    else if(current_game==1){
        ygo_right(current_item);
        current_item = (current_item +1) % 6;
        document.getElementById("ygoname").innerText = ygonames[current_item];
    }
    else if(current_game==2){
        digi_right(current_item);
        current_item = (current_item + 1) % 3;
        document.getElementById("diginame").innerText = digimonnames[current_item];
    }
    
}

function vg_left(item){
    let a = document.getElementById("vg_"+item);
    a.setAttribute('animation', {'property':'rotation', 'to':{x:0, y:90, z:0}, 'dur':'1000'});
    item=(item-1+3)%3;
    a = document.getElementById("vg_"+item);
    a.setAttribute("visible","true");
    a.setAttribute('animation', {'property':'rotation', 'from':{x:0, y:-90, z:0}, 'to':{x:0, y:0, z:0}, 'dur':'1000'});
    
}

function vg_right(item){
    let a = document.getElementById("vg_"+item);
    a.setAttribute('animation', {'property':'rotation', 'to':{x:0, y:-90, z:0}, 'dur':'1000'});
    item=(item+1)%3;
    a = document.getElementById("vg_"+item);
    a.setAttribute("visible","true");
    a.setAttribute('animation', {'property':'rotation', 'from':{x:0, y:90, z:0}, 'to':{x:0, y:0, z:0}, 'dur':'1000'});
    
}

function ygo_left(item){
    let a = document.getElementById("ygo_"+item);
    a.setAttribute('animation', {'property':'rotation', 'to':{x:0, y:90, z:90}, 'dur':'1000'});
    item=(item-1+6)%6;
    a = document.getElementById("ygo_"+item);
    a.setAttribute('animation', {'property':'rotation', 'from':{x:0, y:-90, z:-90}, 'to':{x:0, y:0, z:0}, 'dur':'1000'});
    a.setAttribute("visible","true");

}

function ygo_right(item){
    let a = document.getElementById("ygo_"+item);
    a.setAttribute('animation', {'property':'rotation', 'to':{x:0, y:-90, z:-90}, 'dur':'1000'});
    item=(item+1)%6;
    a = document.getElementById("ygo_"+item);
    a.setAttribute('animation', {'property':'rotation', 'from':{x:0, y:90, z:90}, 'to':{x:0, y:0, z:0}, 'dur':'1000'});
    a.setAttribute("visible","true");

}

function digi_left(item){
    let a = document.getElementById("digi_"+item);
    a.setAttribute('animation', {'property':'rotation', 'to':{x:0, y:90, z:0}, 'dur':'1000'});
    item=(item-1+4)%4;
    a = document.getElementById("digi_"+item);
    a.setAttribute("visible","true");
    a.setAttribute('animation', {'property':'rotation', 'from':{x:0, y:-90, z:0}, 'to':{x:0, y:0, z:0}, 'dur':'1000'});
    
}

function digi_right(item){
    let a = document.getElementById("digi_"+item);
    a.setAttribute('animation', {'property':'rotation', 'to':{x:0, y:-90, z:0}, 'dur':'1000'});
    item=(item+1)%4;
    a = document.getElementById("digi_"+item);
    a.setAttribute("visible","true");
    a.setAttribute('animation', {'property':'rotation', 'from':{x:0, y:90, z:0}, 'to':{x:0, y:0, z:0}, 'dur':'1000'});
    
}

function loadSideBar(){
    var a = document.getElementById("sidebar"); 
    a.style.left='0vw';
    a = document.getElementById("fill");
    a.style.visibility='visible';
}

function removeSideBar(){
    var a = document.getElementById("sidebar"); 
    a.style.left='90vw';
    a = document.getElementById("fill");
    a.style.visibility='hidden';

}

function showSelectionBar(){
    var a = document.getElementById("options");
   
    if(a.style.visibility=='hidden'){
        a.style.visibility='visible';
    } else{a.style.visibility='hidden';}

    if(count==0){count++;
        a.style.visibility='visible';
       
    }
}

function setVG(){
    var a = document.getElementById("options");
    a.style.visibility='hidden';
    current_game=0;
    refresh();
}

function setYGO(){
    var a = document.getElementById("options");
    a.style.visibility='hidden';
    current_game=1;
    refresh();
}

function setDigimon(){
    var a = document.getElementById("options");
    a.style.visibility='hidden';
    current_game=2;
    refresh();
}

function refresh(){
    current_item=0;
    var a;
    for(i=0;i<=2;i++){
        a = document.getElementById(games[i]+"Scene");
        a.style.visibility='hidden';
    }

    a = document.getElementById(games[current_game]+"Scene");
    a.style.visibility='visible';

}
