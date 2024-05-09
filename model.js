const names = ["Eagle", "Akabeko","Jasmine","Logo", "Dragon"]
let current_item=0;
let count=0;




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
    
    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","false");

    a = document.getElementById("akbk");
    a.setAttribute("visible","false");

    a = document.getElementById("jasmine");
    a.setAttribute("visible","false");

    a = document.getElementById("eagle");
    a.setAttribute("visible","false");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","true");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Dragon";

    var imgElement = document.getElementById('render1').getElementsByTagName('img')[0];
    imgElement.src = 'img/dragon.JPG';
    
    // Get the element with the ID 'render1'
    var render1 = document.getElementById('render1');

  
    var imgRender2 = render1.getElementsByTagName('img')[2];
    imgRender2.style.display = 'none';
    imgRender2 = render1.getElementsByTagName('img')[1];
    imgRender2.style.display = 'none';


}

function setLogo(){

    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","true");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","false");

    a = document.getElementById("akbk");
    a.setAttribute("visible","false");

    a = document.getElementById("jasmine");
    a.setAttribute("visible","false");

    a = document.getElementById("eagle");
    a.setAttribute("visible","false");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Logo";
    var imgElement = document.getElementById('render1').getElementsByTagName('img')[0];
    imgElement.src = 'img/logo1.png';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[1];
    imgElement.src = 'img/logo.gif';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[2];
    imgElement.src = 'img/1W20CF07_Logo.jpg';
    var imgRender2 = render1.getElementsByTagName('img')[2];
    imgRender2.style.display = 'block';
    imgRender2 = render1.getElementsByTagName('img')[1];
    imgRender2.style.display = 'block';
}


function setEagle(){
    
    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","false");

    a = document.getElementById("akbk");
    a.setAttribute("visible","false");

    a = document.getElementById("jasmine");
    a.setAttribute("visible","false");

    a = document.getElementById("eagle");
    a.setAttribute("visible","true");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","false");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Eagle";
    var imgElement = document.getElementById('render1').getElementsByTagName('img')[0];
    imgElement.src = 'img/eagle1.png';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[1];
    imgElement.src = 'img/eagle.gif';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[2];
    imgElement.src = 'img/eagle.png';
    var imgRender2 = render1.getElementsByTagName('img')[2];
    imgRender2.style.display = 'block';
    imgRender2 = render1.getElementsByTagName('img')[1];
    imgRender2.style.display = 'block';
}

function setAkbk(){
    
    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","false");

    a = document.getElementById("akbk");
    a.setAttribute("visible","true");

    a = document.getElementById("jasmine");
    a.setAttribute("visible","false");

    a = document.getElementById("eagle");
    a.setAttribute("visible","false");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","false");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Akabeko";
    var imgElement = document.getElementById('render1').getElementsByTagName('img')[0];
    imgElement.src = 'img/akbk.png';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[1];
    imgElement.src = 'img/akbk1.jpg';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[2];
    imgElement.src = 'img/akbk.gif';
    var imgRender2 = render1.getElementsByTagName('img')[2];
    imgRender2.style.display = 'block';
    imgRender2 = render1.getElementsByTagName('img')[1];
    imgRender2.style.display = 'block';
}

function setJasmine(){
    
    var a;
    
    a = document.getElementById("3dlogo");
    a.setAttribute("visible","false");

    a = document.getElementById("akbk");
    a.setAttribute("visible","false");

    a = document.getElementById("jasmine");
    a.setAttribute("visible","true");

    a = document.getElementById("eagle");
    a.setAttribute("visible","false");
    
    a = document.getElementById("dragon");
    a.setAttribute("visible","false");

    var a = document.getElementById("options");
    a.style.visibility='hidden';


    document.getElementById("name").innerText = "Jasmine";
    var imgElement = document.getElementById('render1').getElementsByTagName('img')[0];
    imgElement.src = 'img/jasmine.png';
    imgElement = document.getElementById('render1').getElementsByTagName('img')[1];
    imgElement.src = 'img/jasmine.jpg';
    // Get the element with the ID 'render1'
    var render1 = document.getElementById('render1');

  
    var imgRender2 = render1.getElementsByTagName('img')[2];
    imgRender2.style.display = 'none';
    imgRender2 = render1.getElementsByTagName('img')[1];
    imgRender2.style.display = 'block';

}

window.onload = function() {
document.getElementById("transparentButton").addEventListener("click", function() {
    scrollToBottom();
    
});
};

function scrollToBottom() {
    // Select the element representing the bottom of the page
    window.scrollBy({
        top: window.innerHeight,
        left: 0,
        behavior: 'smooth' // Optional smooth scrolling
    });
}

function scrollToTop() {
    // Select the element representing the bottom of the page
    window.scrollBy({
        top: -window.innerHeight*2,
        left: 0,
        behavior: 'smooth' // Optional smooth scrolling
    });
}
