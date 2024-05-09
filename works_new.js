async function loadSideBar(){
    
    var a = document.getElementById("sidebar"); 
    a.style.display='block';
    a.style.visibility='visible';
   
    a.style.left='0vw';
   
    a = document.getElementById("fill");
    a.style.visibility='visible';
}

function removeSideBar(){
    var a = document.getElementById("sidebar"); 
    a.style.display='none';
    a.style.left='90vw';
    a.style.visibility='hidden';
    a = document.getElementById("fill");
    a.style.visibility='hidden';

}


  