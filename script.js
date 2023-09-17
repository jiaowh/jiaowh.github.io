setTimeout(onLoad, 300);

function test(){
    alert("I'll make this page when I feel like it :p");
}

function onLoad() {
    var a = document.getElementById("logo"); 
    a.style.width = '100vw';
    a.style.height= '40vh';
    a.style.top = '0px';
    a.style.left='0px';
    a = document.getElementById("craft"); 
    a.style.top='35vh';
    a=document.getElementById("art");
    a.style.top='78vh'
    a=document.getElementById("ride");
    a.style.top='80vh'
    a.style.left='50vw';
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame2(){
    a = document.getElementById("craft"); 
    a.style.top='14vh';
    a=document.getElementById("art");
    a.style.top='35vh';
    a=document.getElementById("ride");
    a.style.top='80vh'
    a.style.left='0vw';
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame3(){
    a = document.getElementById("craft"); 
    a.style.top='5vh';
    a=document.getElementById("art");
    a.style.top='21vh';
    a=document.getElementById("ride");
    a.style.top='34vh';
    a.style.left='0vw';
    a=document.getElementById("dev");
    a.style.top='80vh'
}

function frame4() {
    a = document.getElementById("craft"); 
    a.style.top='5vh';
    a=document.getElementById("art");
    a.style.top='21vh'
    a=document.getElementById("ride");
    a.style.top='34vh'
    a.style.left='0vw';
    a=document.getElementById("dev");
    a.style.top='47vh'
}