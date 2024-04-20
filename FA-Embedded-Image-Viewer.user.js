// ==UserScript==
// @name        FA Embedded Image Viewer
// @namespace   Violentmonkey Scripts
// @match       *://*.furaffinity.net/*
// @require     https://update.greasyfork.org/scripts/475041/1267274/Furaffinity-Custom-Settings.js
// @require     https://update.greasyfork.org/scripts/483952/1329447/Furaffinity-Request-Helper.js
// @require     https://update.greasyfork.org/scripts/485153/1316289/Furaffinity-Loading-Animations.js
// @require     https://update.greasyfork.org/scripts/476762/1318215/Furaffinity-Custom-Pages.js
// @require     https://update.greasyfork.org/scripts/485827/1326313/Furaffinity-Match-List.js
// @require     https://update.greasyfork.org/scripts/492931/1362749/Furaffinity-Submission-Image-Viewer.js
// @grant       none
// @version     2.1.0
// @author      Midori Dragon
// @description Embedds the clicked Image on the Current Site, so you can view it without loading the submission Page
// @icon        https://www.furaffinity.net/themes/beta/img/banners/fa_logo.png?v2
// @homepageURL https://greasyfork.org/de/scripts/458971-embedded-image-viewer
// @supportURL  https://greasyfork.org/de/scripts/458971-embedded-image-viewer/feedback
// @license     MIT
// ==/UserScript==

// jshint esversion: 8

CustomSettings.name = "Extension Settings";
CustomSettings.provider = "Midori's Script Settings";
CustomSettings.headerName = `${GM_info.script.name} Settings`;
const openInNewTabSetting = CustomSettings.newSetting("Open in new Tab", "Sets wether to open links in a new Tab or the current one.", SettingTypes.Boolean, "Open in new Tab", true);
const loadingSpinSpeedFavSetting = CustomSettings.newSetting("Fav Loading Animation", "Sets the duration that the loading animation, for faving a submission, takes for a full rotation in milliseconds.", SettingTypes.Number, "", 600);
const loadingSpinSpeedSetting = CustomSettings.newSetting("Embedded Loading Animation", "Sets the duration that the loading animation of the Embedded element to load takes for a full rotation in milliseconds.", SettingTypes.Number, "", 1000);
CustomSettings.loadSettings();

const matchList = new MatchList(CustomSettings);
matchList.matches = ['net/browse', 'net/gallery', 'net/search', 'net/favorites', 'net/scraps', 'net/controls/favorites', 'net/controls/submissions', 'net/msg/submissions', 'd.furaffinity.net'];
matchList.runInIFrame = true;
if (!matchList.hasMatch())
    return;

const page = new CustomPage("d.furaffinity.net", "eidownload");
page.onopen = (data) => {
    downloadImage();
    return;
};

if (matchList.isWindowIFrame() == true)
    return;

const requestHelper = new FARequestHelper(2);

class EmbeddedImage {
    constructor(figure) {
        this.embeddedElem;
        this.backgroundElem;
        this.submissionContainer;
        this.submissionImg;
        this.buttonsContainer;
        this.favButton;
        this.downloadButton;
        this.closeButton;

        this.favRequestRunning = false;
        this.downloadRequestRunning = false;

        this._onRemoveAction;

        this.createStyle();
        this.createElements(figure);

        this.loadingSpinner = new LoadingSpinner(this.submissionContainer);
        this.loadingSpinner.delay = loadingSpinSpeedSetting.value;
        this.loadingSpinner.spinnerThickness = 6;
        this.loadingSpinner.visible = true;
        this.fillSubDocInfos(figure);
    }

    createStyle() {
        if (document.getElementById("embeddedStyle")) return;
        const style = document.createElement("style");
        style.id = "embeddedStyle";
        style.type = "text/css";
        style.innerHTML = `
            #embeddedElem {
                position: fixed;
				width: 100vw;
				height: 100vh;
				max-width: 1850px;
                z-index: 999999;
                background: rgba(30,33,38,.65);
            }
            #embeddedBackgroundElem {
                position: fixed;
                display: flex;
                flex-direction: column;
                left: 50%;
                transform: translate(-50%, 0%);
                margin-top: 20px;
                padding: 20px;
                background: rgba(30,33,38,.90);
                border-radius: 10px;
            }
            .embeddedSubmissionImg {
                max-width: inherit;
                max-height: inherit;
                border-radius: 10px;
            }
            #embeddedButtonsContainer {
                margin-top: 20px;
                margin-bottom: 20px;
                margin-left: 20px;
            }
            .embeddedButton {
                margin-left: 4px;
                margin-right: 4px;
				user-select: none;
            }
        `;
        document.head.appendChild(style);
    }

    onRemove(action) {
        this._onRemoveAction = action;
    }

    remove() {
        this.embeddedElem.parentNode.removeChild(this.embeddedElem);
        if (this._onRemoveAction)
            this._onRemoveAction();
    }

    createElements(figure) {
        this.embeddedElem = document.createElement("div");
        this.embeddedElem.id = "embeddedElem";
        this.embeddedElem.onclick = (event) => {
            if (event.target == this.embeddedElem)
                this.remove();
        };

        this.backgroundElem = document.createElement("div");
        this.backgroundElem.id = "embeddedBackgroundElem";
        notClosingElemsArr.push(this.backgroundElem.id);

        this.submissionContainer = document.createElement("a");
        this.submissionContainer.id = "embeddedSubmissionContainer";
        notClosingElemsArr.push(this.submissionContainer.id);

        this.backgroundElem.appendChild(this.submissionContainer);

        this.buttonsContainer = document.createElement("div");
        this.buttonsContainer.id = "embeddedButtonsContainer";
        notClosingElemsArr.push(this.buttonsContainer.id);

        this.favButton = document.createElement("a");
        this.favButton.id = "embeddedFavButton";
        notClosingElemsArr.push(this.favButton.id);
        this.favButton.type = "button";
        this.favButton.className = "embeddedButton button standard mobile-fix";
        this.favButton.textContent = "⠀⠀";
        this.buttonsContainer.appendChild(this.favButton);

        this.downloadButton = document.createElement("a");
        this.downloadButton.id = "embeddedDownloadButton";
        notClosingElemsArr.push(this.downloadButton.id);
        this.downloadButton.type = "button";
        this.downloadButton.className = "embeddedButton button standard mobile-fix";
        this.downloadButton.textContent = "Download";
        this.buttonsContainer.appendChild(this.downloadButton);

        const byLink = getByLinkFromFigcaption(figure.querySelector("figcaption"));
        if (byLink) {
            this.openGalleryButton = document.createElement("a");
            this.openGalleryButton.id = "embeddedOpenGalleryButton";
            notClosingElemsArr.push(this.openGalleryButton.id);
            this.openGalleryButton.type = "button";
            this.openGalleryButton.className = "embeddedButton button standard mobile-fix";
            this.openGalleryButton.textContent = "Open Gallery";
            const galleryLink = byLink.replace("user", "gallery");
            this.openGalleryButton.href = galleryLink;
            if (openInNewTabSetting.value == true)
                this.openGalleryButton.target = "_blank";
            this.buttonsContainer.appendChild(this.openGalleryButton);
        }

        this.openButton = document.createElement("a");
        this.openButton.id = "embeddedOpenButton";
        notClosingElemsArr.push(this.openButton.id);
        this.openButton.type = "button";
        this.openButton.className = "embeddedButton button standard mobile-fix";
        this.openButton.textContent = "Open";
        const link = figure.querySelector("a[href]");
        this.openButton.href = link;
        if (openInNewTabSetting.value == true)
            this.openButton.target = "_blank";
        this.buttonsContainer.appendChild(this.openButton);

        this.closeButton = document.createElement("a");
        this.closeButton.id = "embeddedCloseButton";
        notClosingElemsArr.push(this.closeButton.id);
        this.closeButton.type = "button";
        this.closeButton.className = "embeddedButton button standard mobile-fix";
        this.closeButton.textContent = "Close";
        this.closeButton.onclick = () => this.remove();
        this.buttonsContainer.appendChild(this.closeButton);

        this.backgroundElem.appendChild(this.buttonsContainer);

        this.embeddedElem.appendChild(this.backgroundElem);

        const ddmenu = document.getElementById("ddmenu");
        ddmenu.appendChild(this.embeddedElem);
    }

    async fillSubDocInfos(figure) {
        const sid = figure.id.split("-")[1];
        const ddmenu = document.getElementById("ddmenu");
        const doc = await requestHelper.SubmissionRequests.getSubmissionPage(sid);
        if (doc) {
            this.submissionImg = doc.getElementById("submissionImg");
            const imgSrc = this.submissionImg.src;
            const prevSrc = this.submissionImg.getAttribute("data-preview-src");
            const prevPrevSrc = prevSrc.replace("@600", "@300");

            const faImageViewer = new CustomImageViewer(imgSrc, prevSrc);
            faImageViewer.faImage.id = "embeddedSubmissionImg";
            faImageViewer.faImagePreview.id = "previewSubmissionImg";
            faImageViewer.faImage.className = faImageViewer.faImagePreview.className = "embeddedSubmissionImg";
            faImageViewer.faImage.style.maxWidth = faImageViewer.faImagePreview.style.maxWidth = window.innerWidth - 20 * 2 + "px";
            faImageViewer.faImage.style.maxHeight = faImageViewer.faImagePreview.style.maxHeight = window.innerHeight - ddmenu.clientHeight - 38 * 2 - 20 * 2 - 100 + "px";
            faImageViewer.onImageLoadStart = () => {
                if (this.loadingSpinner)
                    this.loadingSpinner.visible = false;
            };
            faImageViewer.load(this.submissionContainer);

            this.submissionContainer.href = doc.querySelector('meta[property="og:url"]').content;

            const result = getFavKey(doc);
            this.favButton.textContent = result.isFav ? "+Fav" : "-Fav";
            this.favButton.setAttribute("isFav", result.isFav);
            this.favButton.setAttribute("key", result.favKey);
            this.favButton.onclick = () => {
                if (this.favRequestRunning == false)
                    this.doFavRequest(sid);
            };

            this.downloadButton.onclick = () => {
                if (this.downloadRequestRunning == true)
                    return;
                this.downloadRequestRunning = true;
                const loadingTextSpinner = new LoadingTextSpinner(this.downloadButton);
                loadingTextSpinner.delay = loadingSpinSpeedFavSetting.value;
                loadingTextSpinner.visible = true;
                const iframe = document.createElement("iframe");
                iframe.style.display = "none";
                iframe.src = this.submissionImg.src + "?eidownload";
                iframe.onload = () => {
                    this.downloadRequestRunning = false;
                    loadingTextSpinner.visible = false;
                    setTimeout(() => iframe.parentNode.removeChild(iframe), 100);
                };
                document.body.appendChild(iframe);
            };
        }
    }

    async doFavRequest(sid) {
        this.favRequestRunning = true;
        const loadingTextSpinner = new LoadingTextSpinner(this.favButton);
        loadingTextSpinner.delay = loadingSpinSpeedFavSetting.value;
        loadingTextSpinner.visible = true;
        let favKey = this.favButton.getAttribute("key");
        let isFav = this.favButton.getAttribute("isFav");
        if (isFav == "true") {
            favKey = await requestHelper.SubmissionRequests.favSubmission(sid, favKey);
            loadingTextSpinner.visible = false;
            if (favKey) {
                this.favButton.setAttribute("key", favKey);
                isFav = false;
                this.favButton.setAttribute("isFav", isFav);
                this.favButton.textContent = "-Fav";
            } else {
                this.favButton.textContent = "x";
                setTimeout(() => this.favButton.textContent = "+Fav", 1000);
            }
        } else {
            favKey = await requestHelper.SubmissionRequests.unfavSubmission(sid, favKey);
            loadingTextSpinner.visible = false;
            if (favKey) {
                this.favButton.setAttribute("key", favKey);
                isFav = true;
                this.favButton.setAttribute("isFav", isFav);
                this.favButton.textContent = "+Fav";
            } else {
                this.favButton.textContent = "x";
                setTimeout(() => this.favButton.textContent = "-Fav", 1000);
            }
        }
        this.favRequestRunning = false;
    }
}

function getByLinkFromFigcaption(figcaption) {
    if (figcaption) {
        const infos = figcaption.querySelectorAll("i");
        let byLink;
        for (const info of infos) {
            if (info.textContent.toLowerCase().includes("by")) {
                const linkElem = info.parentNode.querySelector("a[href][title]");
                if (linkElem)
                    byLink = linkElem.href;
            }
        }
        return byLink;
    }
}

function getFavKey(doc) {
    const columnPage = doc.getElementById("columnpage");
    const navbar = columnPage.querySelector('div[class*="favorite-nav"');
    const buttons = navbar.querySelectorAll('a[class*="button"][href]');
    let favButton;
    for (const button of buttons) {
        if (button.textContent.toLowerCase().includes("fav"))
            favButton = button;
    }

    if (favButton) {
        const favKey = favButton.href.split("?key=")[1];
        const isFav = !favButton.href.toLowerCase().includes("unfav");
        return { favKey, isFav };
    }
}

let isShowing = false;
let notClosingElemsArr = [];
let embeddedImage;

addEmbedded();
window.updateEmbedded = addEmbedded;

document.addEventListener("click", (event) => {
    if (event.target.parentNode instanceof HTMLDocument && embeddedImage)
        embeddedImage.remove();
});

async function addEmbedded() {
    for (const figure of document.querySelectorAll('figure:not([embedded])')) {
        figure.setAttribute('embedded', true);
        figure.addEventListener("click", function (event) {
            if (!event.ctrlKey && !event.target.id.includes("favbutton") && event.target.type != "checkbox") {
                if (event.target.href)
                    return;
                else
                    event.preventDefault();
                if (!isShowing)
                    showImage(figure);
            }
        });
    }
}

async function showImage(figure) {
    isShowing = true;
    embeddedImage = new EmbeddedImage(figure);
    embeddedImage.onRemove(() => {
        embeddedImage = null;
        isShowing = false;
    });
}

function downloadImage() {
    console.log("Embedded Image Viewer downloading Image...");
    let url = window.location.toString();
    if (url.includes("?")) {
        const parts = url.split('?');
        url = parts[0];
    }
    const download = document.createElement('a');
    download.href = url;
    download.download = url.substring(url.lastIndexOf("/") + 1);
    download.style.display = 'none';
    document.body.appendChild(download);
    download.click();
    document.body.removeChild(download);

    window.close();
}
