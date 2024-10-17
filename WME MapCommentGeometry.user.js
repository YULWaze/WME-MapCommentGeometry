// ==UserScript==
// @name 			WME MapCommentGeometry
// @author			YUL_
// @description 	This script creates a map note around a single selected road segment. It also allows you to create a camera-shaped note. 
// @match	  		*://*.waze.com/*editor*
// @exclude			*://*.waze.com/user/editor*
// @grant 			none
// @require	  	https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @downloadURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @updateURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @supportURL		https://github.com/YULWaze/WME-MapCommentGeometry/issues/new/choose
// @version 		2024.10.16.02
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

// Instructions
// 1) install this script in Tampermonkey
// 2) select a road in WME
// 3) click the "Use for Note" button at the bottom of the left pane
// 4) create a new Map Note or select an existing one
// 5) click the "Map Note on Road" button on the left pane
//
// 6) If you want to convert a point note to a camera-shaped area, create a new Map Note or select an existing one, and then click the corresponding button

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

/*
	const CameraLeftPoints = [[12,9],[-4,9],[-4,5],[-12,9],[-12,-9],[-4,-5],[-4,-9],[12,-9]];
	const CameraRightPoints = [[-12,9],[4,9],[4,5],[12,9],[12,-9],[4,-5],[4,-9],[-12,-9]];
	const CameraUpPoints = [[9,-12],[9,4],[5,4],[9,12],[-9,12],[-5,4],[-9,4],[-9,-12]];
	const CameraDownPoints = [[9,12],[9,-4],[5,-4],[9,-12],[-9,-12],[-5,-4],[-9,-4],[-9,12]];
*/

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
			mainDiv.append($('<label class="WME-MC-label control-label">Note Geometry</label>'));
			const controlsDiv = $('<div class="controls"/>');
			controlsDiv.append($('<div><button id="WMEMapCommentGeo" class="waze-btn WMEMapCommentGeoButton" type="button">Map Note on Road</button></div>'));


			controlsDiv.append($('<label class="camers-creator-label control-label">Camera-Shaped Notes</label>'));
//			const controlsDiv = $('<div class="controls"/>');
			controlsDiv.append($('<div><button id="LCamera" class="waze-btn LCameraButton" type="button">Left</button></div>'));
			controlsDiv.append($('<div><button id="UCamera" class="waze-btn UCameraButton" type="button">Up</button></div>'));
			controlsDiv.append($('<div><button id="RCamera" class="waze-btn RCameraButton" type="button">Right</button></div>'));
			controlsDiv.append($('<div><button id="DCamera" class="waze-btn DCameraButton" type="button">Down</button></div>'));


			mainDiv.append(controlsDiv);
			regionDiv.append(mainDiv);
			lockRegion.before(regionDiv);

			$('.WMEMapCommentGeoButton').on('click', WMEcreateComment);

			$('.LCameraButton').on('click', createLCamera);
			$('.UCameraButton').on('click', createUCamera);
			$('.RCameraButton').on('click', createRCamera);
			$('.DCameraButton').on('click', createDCamera);

		}
	}

	function WMEcreateComment() {
		if(polyPoints === null){
				console.error("WME MapCommentGeometry: No road selected!");
				return null;
		}
		else{
			updateCommentForRoad(polyPoints);
		}
	}

	function updateCommentForRoad(points) {
		if (WazeWrap.hasMapCommentSelected())
		{
			let model = WazeWrap.getSelectedDataModelObjects()[0];
			var newerGeo;
			var newerLinear;

// YUL_: Is it actually necessary to create a Polygon and put a LinearRing inside it?
			newerGeo = new OpenLayers.Geometry.Polygon;
			newerLinear = new OpenLayers.Geometry.LinearRing;
			newerLinear.components = points;

			newerGeo.components[0] = newerLinear;
			newerGeo = W.userscripts.toGeoJSONGeometry(newerGeo);
			let UO = require("Waze/Action/UpdateObject");
			W.model.actionManager.add(new UO(model, { geoJSONGeometry: newerGeo }));
		}
	}


	function updateCommentForCamera(points){
		if (WazeWrap.hasMapCommentSelected())
		{
			let model = WazeWrap.getSelectedDataModelObjects()[0];

			center = model.getOLGeometry().getCentroid();

			let newerGeo = getCameraWKT(points);
			newerGeo = W.userscripts.toGeoJSONGeometry(newerGeo);
			let UO = require("Waze/Action/UpdateObject");
			W.model.actionManager.add(new UO(model, { geoJSONGeometry: newerGeo }));
		}
	}

	function createLCamera(){ updateCommentForCamera(CameraLeftPoints); }
	function createUCamera(){ updateCommentForCamera(CameraUpPoints); }
	function createRCamera(){ updateCommentForCamera(CameraRightPoints); }
	function createDCamera(){ updateCommentForCamera(CameraDownPoints); }

	function getCameraWKT(points){
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
//			divControls1.append(chk);
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


		// Process Map Comment Button
		function doMapComment(ev) {
			// let convertOK;
			const foundSelectedSegment = false;
			let sel;
			let NumSegments;
			polyPoints = null;

			// 2013-10-20: Get comment width
			const selCommentWidth = document.getElementById('CommentWidth');
			TheCommentWidth = parseInt(selCommentWidth.options[selCommentWidth.selectedIndex].value, 10);

			setlastCommentWidth(TheCommentWidth);

			console.log(`Comment width: ${TheCommentWidth}`);

			// Search for helper road. If found create or expand a Map Comment

			const f = W.selectionManager.getSelectedFeatures();

			if (f.length === 0) {
				console.error('No road selected!');
				return null;
			}

			NumSegments = f.length - 1;
			for (let s = NumSegments; s >= 0; s--) {
				sel = f[s]._wmeObject;

				if (sel.type === 'segment') {
					// found segment
					// foundSelectedSegment = true;
					// convertOK = convertToLandmark(sel);
					convertToLandmark(sel, NumSegments, s);
				}
			}
		}

		// Based on selected helper road modifies a map comment to precisely follow the road's geometry
		function convertToLandmark(sel, NumSegments, s) {
			let i;
			let leftPa; let rightPa; let leftPb; let rightPb;
//			let prevLeftEq; let prevRightEq;
//			const street = getStreet(sel);

			const streetVertices = sel.geometry.getVertices();

			const firstStreetVerticeOutside = 0;

			// 2013-10-13: Add to polyPoints polygon
			if (s<=1) {
				console.log('WME Map Comment polygon: Create');
			}
			const first = 0;

//			polyPoints = null;


			for (i = first; i < streetVertices.length - 1; i++) {
				const pa = streetVertices[i];
				const pb = streetVertices[i + 1];
				const scale = (pa.distanceTo(pb) + TheCommentWidth) / pa.distanceTo(pb);

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

				if (polyPoints === null) polyPoints = [leftPa, rightPa];
				else {
					const li = intersectX(leftEq, prevLeftEq);
					const ri = intersectX(rightEq, prevRightEq);
					if (li && ri) {
						// 2013-10-17: Is point outside comment?
						if (i >= firstStreetVerticeOutside) {
							polyPoints.unshift(li);
							polyPoints.push(ri);
						}
					} else {
						// 2013-10-17: Is point outside comment?
						if (i >= firstStreetVerticeOutside) {
							polyPoints.unshift(leftPb.clone());
							polyPoints.push(rightPb.clone());
						}
					}
				}

				prevLeftEq = leftEq;
				prevRightEq = rightEq;

				console.log(`Point:${leftPb}  ${rightPb}`);

				// 2013-06-03: Is Waze limit reached?
				// YUL_: Is this still relevant?
				//				if (polyPoints.length > 50) {
				//					break;
				//				}
			}

			polyPoints.push(rightPb);
			polyPoints.push(leftPb);

			// YUL_: Add the first point at the end of the array to close the shape!
			// YUL_: When creating a comment or other polygon, WME will automatically do this, but since we are modifying an existing Map Comment, we must do it here!
			if (s==0) {
				polyPoints.push(polyPoints[0]);
				// YUL_: At this point we have the shape we need, and have to convert the existing map comment into that shape.
				console.log("WME Map Comment polygon: done");
			}

			return true;
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
					langText = new Array("Select a road and click this button.","Use for Note");
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
