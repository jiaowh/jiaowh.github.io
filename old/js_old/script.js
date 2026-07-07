setTimeout(onLoad, 300);

// The stacked-card intro animation only applies to the portrait layout;
// landscape is laid out purely in CSS (css_old/desktop.css).
function isPortrait() {
    return window.innerHeight >= window.innerWidth;
}

function test(){
    alert("I'll make this page when I feel like it :p");
}

function onLoad() {
    if (!isPortrait()) return;
    var a = document.getElementById("logo");
    a.style.width = '100vw';
    a.style.height= '40vh';
    a.style.top = '0px';
    a.style.left='0px';
    a = document.getElementById("craft"); 
    a.style.top='42vh';
    a=document.getElementById("art");
    a.style.top='60vh'
    a=document.getElementById("ride");
    a.style.top='68vh'
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame1(){
    if (!isPortrait()) return;
    a = document.getElementById("craft");
    a.style.top='3vh';
    a=document.getElementById("art");
    a.style.top='60vh';
    a=document.getElementById("ride");
    a.style.top='68vh'
    
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame2(){
    if (!isPortrait()) return;
    a = document.getElementById("craft");
    a.style.top='3vh';
    a=document.getElementById("art");
    a.style.top='20vh';
    a=document.getElementById("ride");
    a.style.top='68vh'
   
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame3(){
    if (!isPortrait()) return;
    a = document.getElementById("craft");
    a.style.top='3vh';
    a=document.getElementById("art");
    a.style.top='20vh';
    a=document.getElementById("ride");
    a.style.top='29vh';
    
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame4() {
    if (!isPortrait()) return;
    a = document.getElementById("craft");
    a.style.top='3vh';
    a=document.getElementById("art");
    a.style.top='20vh';
    a=document.getElementById("ride");
    a.style.top='29vh';
    a=document.getElementById("dev");
    a.style.top='53vh'
}