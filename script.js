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
    a.style.top='42vh';
    a=document.getElementById("art");
    a.style.top='60vh'
    a=document.getElementById("ride");
    a.style.top='68vh'
    a=document.getElementById("dev");
    a.style.top='90vh'
}

function frame1(){
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
    a = document.getElementById("craft"); 
    a.style.top='3vh';
    a=document.getElementById("art");
    a.style.top='20vh';
    a=document.getElementById("ride");
    a.style.top='29vh';
    a=document.getElementById("dev");
    a.style.top='53vh'
}