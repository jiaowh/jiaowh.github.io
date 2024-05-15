document.addEventListener("DOMContentLoaded", function() {
    const mediaElements = document.querySelectorAll("figure img, figure video");
    const overlay = document.getElementById("overlay");
    let isExpanded = false;
    let expandedElement = null;

    mediaElements.forEach((media) => {
        // Expand media on click
        media.addEventListener("click", function(event) {
            event.stopPropagation();
            if (window.innerWidth < window.innerHeight) {
                if (!isExpanded) {
                    media.style.position = "fixed";
                    media.style.top = "0";
                    media.style.left = "0";
                    media.style.width = "100vw";
                    media.style.height = "auto";
                    media.style.zIndex = "1000";
                    media.classList.remove("highlight-animation");
                    overlay.style.display = "block";
                    media.style.top = '50%';
                    media.style.padding='0';
                    media.style.transform = 'translateY(-50%)';
                    isExpanded = true;
                    expandedElement = media;
                    
                } else if (expandedElement === media) {
                    media.style.position = "";
                    media.style.top = "";
                    media.style.left = "";
                    media.style.width = "";
                    media.style.height = "";
                    media.style.zIndex = "";
                    media.classList.add("highlight-animation");
                    overlay.style.display = "none";
                    isExpanded = false;
                    media.style.top = '';
                    media.style.transform = '';
                    media.style.padding='7.5% 7.5% 10% 7.5%';
                    expandedElement = null;
                }
            }
        });

        // Prevent propagation of click events to the document when clicking on the media
        media.addEventListener("click", function(event) {
            event.stopPropagation();
        });
    });

    // Restore media when clicking anywhere on the screen
    document.addEventListener("click", function() {
        if (isExpanded && expandedElement) {
            expandedElement.style.position = "";
            expandedElement.style.top = "";
            expandedElement.style.left = "";
            expandedElement.style.width = "";
            expandedElement.style.height = "";
            expandedElement.style.zIndex = "";
            expandedElement.classList.add("highlight-animation");
            overlay.style.display = "none";
            isExpanded = false;
            expandedElement.style.top = '';
            expandedElement.style.transform = '';
            expandedElement = null;
        }
    });
});


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
    
    
      

