const names = ["Logo", "Dragon"]
let current_item=0;
let count=0;




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

function setDragon(){
    current_item=0;
    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","false");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","true");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Dragon";

}

function setLogo(){
    current_item=0;
    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","true");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","false");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Logo";

}




