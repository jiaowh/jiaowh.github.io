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