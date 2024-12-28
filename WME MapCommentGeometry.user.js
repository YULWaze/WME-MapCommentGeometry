// ==UserScript==
// @name 			WME MapCommentGeometry
// @author			YUL_
// @description 	This script creates a map note around a single selected road segment. It also allows you to create a camera or an arrow shaped note.
// @match	  		*://*.waze.com/*editor*
// @exclude			*://*.waze.com/user/editor*
// @grant 			none
// @require	  	https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @require			https://davidsl4.github.io/WMEScripts/lib/map-comments-polyfill.js
// @downloadURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @updateURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @supportURL		https://github.com/YULWaze/WME-MapCommentGeometry/issues/new/choose
// @version 		2024.12.28.01	
// ==/UserScript==

/* global W */
/* global OpenLayers */
/* ecmaVersion 2017 */
/* global require */
/* global $ */
/* global _ */
/* global WazeWrap */
/* eslint curly: ["warn", "multi-or-nest"] */

// Hacked together by YUL_ based on WME Street to River and WME Wazer Creater
// Thanks to MapOMatic for fixing WME Wazer Creater
// Thanks to DeviateFromThePlan for cleaning up the code
// Thanks to LihtsaltMats for suggesting cleaner placement for the buttons and implementing that
// Thanks to r0den for allowing the note to be created directly on the segment and cleaning up the code

// Instructions
// 1) install this script in Tampermonkey
// 2) select a road in WME
// 3) click the "Use for Note" button at the bottom of the left pane
// 4) create a new Map Note or select an existing one
// 5) click the "Map Note on Road" button on the left pane
//
// 6) If you want to convert a point note to a camera or arrow-shaped area, create a new Map Note or select an existing one, and then click the corresponding button

/*
To do:

- Clean up and simplify the code

- This will sometimes create map comments with invalid geometry based on how the original road is shaped.
It could be interesting to simplify the map comment geometry accordingly.
See simplify.js by Volodymyr Agafonkin (https://github.com/mourner/simplify-js)

- Allow this script to place a map comment on multiple selected segments

- Feedback:
*/

(function() {
	const UPDATE_NOTES = 'Added ability to create map comment shapes';
	const SCRIPT_NAME = GM_info.script.name;
	const SCRIPT_VERSION = GM_info.script.version;
	const idTitle = 0;
	const idMapCommentGeo = 1;

	const CameraLeftPoints = [[11,6],[-4,6],[-4,3],[-11,6],[-11,-6],[-4,-3],[-4,-6],[11,-6]];
	const CameraRightPoints = [[-11,6],[4,6],[4,3],[11,6],[11,-6],[4,-3],[4,-6],[-11,-6]];
	const CameraUpPoints = [[6,-11],[6,4],[3,4],[6,11],[-6,11],[-3,4],[-6,4],[-6,-11]];
	const CameraDownPoints = [[6,11],[6,-4],[3,-4],[6,-11],[-6,-11],[-3,-4],[-6,-4],[-6,11]];

    const ArrowRightPoints = [[0,-36],[0,-12],[5,-7],[12,-6],[24,-6],[24,-18],[36,0],[24,18],[24,6],[12,6],[2,4],[-4,2],[-8,-2],[-12,-9],[-12,-36]];
    const ArrowLeftPoints = [[0,-36],[0,-12],[-5,-7],[-12,-6],[-24,-6],[-24,-18],[-36,0],[-24,18],[-24,6],[-12,6],[-2,4],[4,2],[8,-2],[12,-9],[12,-36]];
    const ArrowStraightPoints = [[6,-18],[6,6],[18,6],[0,18],[-18,6],[-6,6],[-6,-18]];

	var polyPoints = null;
	let prevLeftEq;
	let prevRightEq;
    let center;

    // Default widths of the Map Comment around the existing road depending on road type
    // sel.attributes.roadType: 1 = Street, 2 = PS, 3 = Freeway, 4 = Ramp, 6 = MH, 7 = mH, 8 = Offroad, 17 = Private, 20 = Parking lot
    //	const CommentWidths = [15,20,40,15,15,30,30];
	const DefaultCommentWidth = 10;
	let TheCommentWidth;

	function addWMEMCbutton() {
		if (WazeWrap.hasMapCommentSelected()) {
			let mapComment = WazeWrap.getSelectedFeatures()[0];
			const lockRegion = $('.lock-edit-region');

			const regionDiv = $('<div class="WME-MC-region"/>');
			const mainDiv = $('<div class="form-group"/>');
			const controlsDiv = $('<div class="controls"/>');

			controlsDiv.append($('<label class="camers-creator-label control-label">Cameras</label>'));
			const joystickContainer = $('<div style="display: flex; flex-direction: column; align-items: center;"/>');
			joystickContainer.append($('<button id="UCamera" class="waze-btn UCameraButton" type="button" style="margin-bottom: 5px;">Up</button>'));
			
			const middleRow = $('<div style="display: flex; gap: 1em;"/>');
			middleRow.append($('<button id="LCamera" class="waze-btn LCameraButton" type="button">Left</button>'));
			middleRow.append($('<button id="RCamera" class="waze-btn RCameraButton" type="button">Right</button>'));
			joystickContainer.append(middleRow);
			
			joystickContainer.append($('<button id="DCamera" class="waze-btn DCameraButton" type="button" style="margin-top: 5px;">Down</button>'));
			controlsDiv.append(joystickContainer);

			controlsDiv.append($('<label class="camers-creator-label control-label">Arrows</label>'));
			const arrowContainer = $('<div style="display: flex; gap: 1em; justify-content: center;"/>');
			arrowContainer.append($('<button id="LArrow" class="waze-btn LArrowButton" type="button">Left</button>'));
			arrowContainer.append($('<button id="LArrow" class="waze-btn SArrowButton" type="button">Straight</button>'));
			arrowContainer.append($('<button id="RArrow" class="waze-btn RArrowButton" type="button">Right</button>'));
			controlsDiv.append(arrowContainer);

			mainDiv.append(controlsDiv);
			regionDiv.append(mainDiv);
			lockRegion.before(regionDiv);

			$('.LCameraButton').on('click', createLCamera);
			$('.UCameraButton').on('click', createUCamera);
			$('.RCameraButton').on('click', createRCamera);
			$('.DCameraButton').on('click', createDCamera);

			$('.LArrowButton').on('click', createLArrow);
			$('.SArrowButton').on('click', createSArrow);
			$('.RArrowButton').on('click', createRArrow);
		}
	}

	async function createComment(points) {
		// YUL_: Is it actually necessary to create a Polygon and put a LinearRing inside it?
		newerGeo = new OpenLayers.Geometry.Polygon;
		newerLinear = new OpenLayers.Geometry.LinearRing;
		newerLinear.components = points;

		newerGeo.components[0] = newerLinear;
		newerGeo = W.userscripts.toGeoJSONGeometry(newerGeo);
		let CO = require("Waze/Action/CreateObject");
		const mapComment = await WS.MapNotes.createNote({
			geoJSONGeometry: newerGeo,
		});
		W.model.actionManager.add(new CO(mapComment, W.model.mapComments)); // CO accepts two arguments: entity and repository
		return mapComment;
	}

	function updateCommentGeometry(points){
		if (WazeWrap.hasMapCommentSelected())
		{
			let model = WazeWrap.getSelectedDataModelObjects()[0];

			center = model.getOLGeometry().getCentroid();

			let newerGeo = getShapeWKT(points);
			newerGeo = W.userscripts.toGeoJSONGeometry(newerGeo);
			let UO = require("Waze/Action/UpdateObject");
			W.model.actionManager.add(new UO(model, { geoJSONGeometry: newerGeo }));
		}
	}

	function createLCamera(){ updateCommentGeometry(CameraLeftPoints); }
	function createUCamera(){ updateCommentGeometry(CameraUpPoints); }
	function createRCamera(){ updateCommentGeometry(CameraRightPoints); }
	function createDCamera(){ updateCommentGeometry(CameraDownPoints); }

	function createLArrow(){ updateCommentGeometry(ArrowLeftPoints); }
    function createSArrow(){ updateCommentGeometry(ArrowStraightPoints); }
	function createRArrow(){ updateCommentGeometry(ArrowRightPoints); }

	function getShapeWKT(points){
		let wktText = 'POLYGON((';
		for (let i=0; i < points.length; i++){
			wktText += `${center.x + points[i][0]} ${center.y + points[i][1]},`;
		}
		wktText = wktText.slice(0, -1)
		wktText += '))';
		return OpenLayers.Geometry.fromWKT(wktText);
	}

	function WMEMapCommentGeometry_bootstrap() {
	   var wazeapi = W || window.W;
	   if(!wazeapi || !wazeapi.map || !WazeWrap.Interface) {
		  setTimeout(WMEMapCommentGeometry_bootstrap, 1000);
		  return;
	   }

		WMEMapCommentGeometry_init();
	}

	function WMEMapCommentGeometry_init() {
		try {
			let updateMonitor = new WazeWrap.Alerts.ScriptUpdateMonitor(SCRIPT_NAME, SCRIPT_VERSION, 'https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js', GM_xmlhttpRequest);
			updateMonitor.start();
		} catch (ex) {
			// Report, but don't stop if ScriptUpdateMonitor fails.
			console.log(ex.message);
		}

    var langText;

    function addWMESelectSegmentbutton() {

// 2024-03-29 from WME UR-MP tracking
		const f = W.selectionManager.getSelectedFeatures()

		if (f.length === 0) {
		  return null
		}

		// 2013-04-19: Catch exception
		try{
			if(document.getElementById('MapCommentGeo') !== null) return;
		}
		catch(e) { }

		// Add button
		var btn1 = $('<button class="btn btn-primary" title="' + getString(idTitle) + '">' + getString(idMapCommentGeo) + '</button>');
		btn1.click(doMapComment);

		// Add dropdown for comment width
		var selCommentWidth = $('<select id="CommentWidth" data-type="numeric" class="form-control" />');
		selCommentWidth.append( $('<option value="5">5</option>') );
		selCommentWidth.append( $('<option value="10">10</option>') );
		selCommentWidth.append( $('<option value="15">15</option>') );
		selCommentWidth.append( $('<option value="20">20</option>') );
		selCommentWidth.append( $('<option value="25">25</option>') );

		// Add MapCommentGeo section
		var cnt = $('<section id="MapCommentGeo" />');

		// Add comment width to section
		var divGroup1 = $('<div class="form-group" />');
		divGroup1.append( $('<label class="col-xs-4">Width:</label>') );
		var divControls1 = $('<div class="col-xs-8 controls" />');
		divControls1.append(selCommentWidth);
//		divControls1.append(chk);
		divGroup1.append(divControls1);
		cnt.append(divGroup1);

		// Add button
		var divGroup2 = $('<div class="form-group"/>');
		divGroup2.append( $('<label class="col-xs-4">&nbsp;</label>') );
		var divControls2 = $('<div class="col-xs-8 controls" />');
		divControls2.append(btn1);
		divGroup2.append(divControls2);
		cnt.append(divGroup2);

		$("#segment-edit-general").append(cnt);

		// Select last comment width
		var lastCommentWidth = getLastCommentWidth(DefaultCommentWidth);
		console.log("Last comment width: " + lastCommentWidth);
		selCommentWidth = document.getElementById('CommentWidth');
		if(selCommentWidth!==null){
			for(var i=0; i < selCommentWidth.options.length; i++){
				if(selCommentWidth.options[i].value == lastCommentWidth){
					selCommentWidth.selectedIndex = i;
					break;
				}
			}
		}

		WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, SCRIPT_VERSION, UPDATE_NOTES, '');

		console.log("WME MapCommentGeometry");
	}

	function getGeometryForSegments(segments, width) {
		const conversion = {
			points: null,
			lastLeftEq: null,
			lastRightEq: null,
		};

		for (let i = segments.length - 1; i >= 0; i--) {
			const segment = segments[i];
			convertToLandmark(segment, NaN, i, conversion, width);
		}

		return conversion.points;
	}


	// Process Map Comment Button
	function doMapComment(ev) {
		// 2013-10-20: Get comment width
		const selCommentWidth = document.getElementById('CommentWidth');
		const width = parseInt(selCommentWidth.options[selCommentWidth.selectedIndex].value, 10);

		setlastCommentWidth(width);

		console.log(`Comment width: ${width}`);

		const f = W.selectionManager.getSelectedFeatures();

		if (f.length === 0) {
			console.error('No road selected!');
			return null;
		}

		const segments = f.map((feature) => feature._wmeObject).filter((object) => object.type === 'segment');

		createComment(getGeometryForSegments(segments, width)).then((mapComment) => {
			W.selectionManager.unselectAll();
			W.selectionManager.selectFeatures([mapComment.getID()]);
		});
	}

	// Based on selected helper road modifies a map comment to precisely follow the road's geometry
	function convertToLandmark(sel, NumSegments, s, conversion = { points: polyPoints, lastRightEq: prevRightEq, lastLeftEq: prevLeftEq }, width = TheCommentWidth) {
		let i;
		let leftPa; let rightPa; let leftPb; let rightPb;

		const streetVertices = sel.geometry.getVertices();

		const firstStreetVerticeOutside = 0;

		// 2013-10-13: Add to polyPoints polygon
		if (s<=1) {
			console.log('WME Map Comment polygon: Create');
		}
		const first = 0;

//		polyPoints = null;

		for (i = first; i < streetVertices.length - 1; i++) {
			const pa = streetVertices[i];
			const pb = streetVertices[i + 1];
			const scale = (pa.distanceTo(pb) + width) / pa.distanceTo(pb);
			leftPa = pa.clone();
			leftPa.resize(scale, pb, 1);
			rightPa = leftPa.clone();
			leftPa.rotate(90, pa);
			rightPa.rotate(-90, pa);

			leftPb = pb.clone();
			leftPb.resize(scale, pa, 1);
			rightPb = leftPb.clone();
			leftPb.rotate(-90, pb);
			rightPb.rotate(90, pb);

			const leftEq = getEquation({
				x1: leftPa.x, y1: leftPa.y, x2: leftPb.x, y2: leftPb.y
			});
			const rightEq = getEquation({
				x1: rightPa.x, y1: rightPa.y, x2: rightPb.x, y2: rightPb.y
			});

			if (conversion.points === null) conversion.points = [leftPa, rightPa];
			else {
				const li = intersectX(leftEq, conversion.lastLeftEq);
				const ri = intersectX(rightEq, conversion.lastRightEq);
				if (li && ri) {
					// 2013-10-17: Is point outside comment?
					if (i >= firstStreetVerticeOutside) {
						conversion.points.unshift(li);
						conversion.points.push(ri);
					}
				} else {
					// 2013-10-17: Is point outside comment?
					if (i >= firstStreetVerticeOutside) {
						conversion.points.unshift(leftPb.clone());
						conversion.points.push(rightPb.clone());
					}
				}
			}

			conversion.lastLeftEq = leftEq;
			conversion.lastRightEq = rightEq;

			console.log(`Point:${leftPb}  ${rightPb}`);
		}

		conversion.points.push(rightPb);
		conversion.points.push(leftPb);

		// YUL_: Add the first point at the end of the array to close the shape!
		// YUL_: When creating a comment or other polygon, WME will automatically do this, but since we are modifying an existing Map Comment, we must do it here!
		if (s==0) {
			conversion.points.push(conversion.points[0]);
			// YUL_: At this point we have the shape we need, and have to convert the existing map comment into that shape.
			console.log("WME Map Comment polygon: done");
		}

		return conversion.points;
  }

	function getEquation(segment) {
		if (segment.x2 == segment.x1) {
			return { 'x': segment.x1 };
		}

		var slope = (segment.y2 - segment.y1) / (segment.x2 - segment.x1);
		var offset = segment.y1 - (slope * segment.x1);
		return { 'slope': slope, 'offset': offset };
	}

	// line A: y = ax + b
	// line B: y = cx + b
	// x = (d - b) / (a - c)
	function intersectX(eqa,eqb,defaultPoint) {
		if ("number" == typeof eqa.slope && "number" == typeof eqb.slope) {
			if (eqa.slope == eqb.slope) {
				return null;
			}

			var ix = (eqb.offset - eqa.offset) / (eqa.slope - eqb.slope);
			var iy = eqa.slope * ix + eqa.offset;
			return new OpenLayers.Geometry.Point(ix, iy);
		}
		else if ("number" == typeof eqa.x) {
			return new OpenLayers.Geometry.Point(eqa.x, eqb.slope * eqa.x + eqb.offset);
		}
		else if ("number" == typeof eqb.y) {
			return new OpenLayers.Geometry.Point(eqb.x, eqa.slope * eqb.x + eqa.offset);
		}
		return null;
	}

	function getStreet(segment) {
		if (!segment.attributes.primaryStreetID) {
			return null;
		}
		var street = segment.model.streets.get(segment.attributes.primaryStreetID);
		return street;
	}

	// 2013-06-09: Save current comment Width
	function setlastCommentWidth(CommentWidth){
		if(typeof(Storage)!=="undefined"){
			// 2013-06-09: Yes! localStorage and sessionStorage support!
			sessionStorage.CommentWidth=Number(CommentWidth);
		 }
		 else{
		   // Sorry! No web storage support..
		   console.log("No web storage support");
		 }
	}

	// 2013-06-09: Returns last saved comment width
	function getLastCommentWidth(CommentWidth){
		if(typeof(Storage)!=="undefined"){
			// 2013-06-09: Yes! localStorage and sessionStorage support!
			if(sessionStorage.CommentWidth)
				return Number(sessionStorage.CommentWidth);
			else
				return Number(CommentWidth);	// Default comment width
		 }
		 else{
		   return Number(CommentWidth);	// Default comment width
		 }
	}

	// 2014-06-05: Returns WME interface language
	function getLanguage() {
		var wmeLanguage;
		var urlParts;
		urlParts = location.pathname.split("/");
		wmeLanguage = urlParts[1].toLowerCase();
		if (wmeLanguage==="editor") {
			wmeLanguage = "us";
		}
		return wmeLanguage;
	}

	// 2014-06-05: Translate text to different languages
	function intLanguageStrings() {
		switch(getLanguage()) {
			default:		// 2014-06-05: English
				langText = new Array("Select a road and click this button.","Create Note");
		}
	}

	// 2014-06-05: Returns the translated string to current language, if the language is not recognized assumes English
	function getString(stringID) {
		return langText[stringID];
	}

	intLanguageStrings();

	W.selectionManager.events.register("selectionchanged", null, addWMESelectSegmentbutton);
	W.selectionManager.events.register("selectionchanged", null, addWMEMCbutton);
}

WMEMapCommentGeometry_bootstrap();

})();
