// ==UserScript==
// @name 			WME MapCommentGeometry
// @author			YUL_
// @description 	This script creates a map note around a single selected road segment. It also allows you to create a camera or an arrow shaped note.
// @match			*://*.waze.com/*editor*
// @exclude			*://*.waze.com/user/editor*
// @grant 			none
// @require			https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @require			https://davidsl4.github.io/WMEScripts/lib/map-comments-polyfill.js
// @downloadURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @updateURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @supportURL		https://github.com/YULWaze/WME-MapCommentGeometry/issues/new/choose
// @version 		2024.12.28.02
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

			const createJoystick = (areas, buttons) => {
				const unassignedAreas = new Set(areas.flat());
				const maxControlsInRow = areas.reduce((currentMax, row) => Math.max(currentMax, row.length), 0);
				const cssAreas = areas.map((row) => {
					if (row.length === maxControlsInRow) return `"${row.join(' ')}" 1fr`;

					const singleAreaUnits = Math.floor(maxControlsInRow / row.length);
					const availableUnits = maxControlsInRow - (singleAreaUnits * row.length);

					return row.reduce((result, currentArea, currentAreaIndex, areas) => {
						const isLastArea = currentAreaIndex + 1 >= areas.length;
						const insert = (times) => {
							for (let i = 0; i < times; i++) result.push(currentArea);
						}

						insert(singleAreaUnits);
						if (isLastArea) insert(availableUnits);

						return `"${result.join(' ')}" 1fr`;
					}, []);
				}).join(' ');

				const joystickContainer = $('<div style="display: grid; align-items: center;"/>');
				joystickContainer.css('grid-template', cssAreas);

				const buttonElements = {};
				buttons.forEach((button) => {
					const { name, icon, handler, isSelectable = true, flipIconVertically = false } = button;
					if (!unassignedAreas.has(name)) return;
					unassignedAreas.delete(name);

					const $icon = $(`<i class="w-icon w-icon-${icon}" />`);
					if (flipIconVertically) $icon.css('transform', 'rotateX(180deg)');

					const $btn = $('<wz-button color="clear-icon" size="sm" />');
					$btn.css('grid-area', name);
					if (!isSelectable) {
						$btn.attr('disabled', true);
						$icon.css('color', '#000');
					}
					$btn.append($icon);
					$btn.click((e) => e.target.blur());
					if (handler) $btn.click(handler);
					joystickContainer.append($btn);
					buttonElements[name] = $btn;
				});

				Array.from(unassignedAreas.values()).forEach((area) => {
					const $dummy = $('<div />');
					$dummy.css('grid-area', area);
					joystickContainer.append($dummy);
				})

				return {
					root: joystickContainer,
					buttons: buttonElements,
				};
			};

			const DPAD_AREA = {
				Up: 'up',
				Left: 'left',
				Right: 'right',
				Down: 'down',
			};
			const DPAD_NAV_ICONS = {
				[DPAD_AREA.Up]: 'arrow-up',
				[DPAD_AREA.Down]: 'arrow-down',
				[DPAD_AREA.Left]: 'arrow-left',
				[DPAD_AREA.Right]: 'arrow-right',
			}
			const createDPadJoystick = (buttons, dpadIcon, size = '100%') => {
				if (buttons.length !== 4) throw new Error('There must be exactly 4 buttons in a D-Pad');

				buttons.forEach((button) => {
					button.icon = button.icon || DPAD_NAV_ICONS[button.name];
				});

				const { root, buttons: buttonElements } = createJoystick([
					[DPAD_AREA.Up],
					[DPAD_AREA.Left, 'icon', DPAD_AREA.Right],
					[DPAD_AREA.Down],
				], [
					...buttons,
					dpadIcon && { name: 'icon', icon: dpadIcon, isSelectable: false },
				].filter(Boolean));

				Object.entries(buttonElements).forEach(([btnName, $btn]) => {
					if (!Object.values(DPAD_AREA).includes(btnName)) return;

					$btn.css('justify-self', 'center');
					$btn.css('width', 'fit-content');
				})

				root.css('aspect-ratio', '1');
				root.css('max-width', size);
				root.css('background-color', 'var(--surface_default)');
				root.css('border-radius', '50%');
				root.css('overflow', 'hidden');
				return root;
			}

			const createDPadControl = (controlName, buttons, dpadIcon, size = '100%') => {
				const $container = $('<div style="flex: 1" />');
				$container.append($(`<wz-label style="text-align: center">${controlName}</wz-label>`));
				$container.append(createDPadJoystick(
					buttons,
					dpadIcon,
					size
				));
				return $container;
			}

			const joysticksContainers = $('<div class="form-group" style="display: flex; gap: 12px" />');
			joysticksContainers.append(
				createDPadControl(
					'Cameras',
					[
						{ name: DPAD_AREA.Up, handler: createUCamera },
						{ name: DPAD_AREA.Down, handler: createDCamera },
						{ name: DPAD_AREA.Left, handler: createLCamera },
						{ name: DPAD_AREA.Right, handler: createRCamera },
					],
					'speed-camera',
				),
			);
			joysticksContainers.append(
				createDPadControl(
					'Arrows',
					[
						{ name: DPAD_AREA.Up, handler: createSArrow },
						{ name: 'DUMMY', handler: () => null, isSelectable: false, },
						{ name: DPAD_AREA.Left, icon: 'turn-left', handler: createLArrow },
						{ name: DPAD_AREA.Right, icon: 'turn-right', handler: createRArrow },
					],
				),
			);

			controlsDiv.append(joysticksContainers);

			mainDiv.append(controlsDiv);
			regionDiv.append(mainDiv);
			lockRegion.before(regionDiv);
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
		const createMapNoteBtn = $(`<wz-button style="--space-button-text: 100%;" size="sm" color="text">${getString(idMapCommentGeo)}</wz-button>`);
		createMapNoteBtn.click((e) => e.target.blur());
		createMapNoteBtn.click(doMapComment);

		// Add dropdown for comment width
		const selCommentWidth = $('<wz-select id="CommentWidth" style="flex: 1" />');
		selCommentWidth.append( $('<wz-option value="5">5 m</wz-option>') );
		selCommentWidth.append( $('<wz-option value="10">10 m</wz-option>') );
		selCommentWidth.append( $('<wz-option value="15">15 m</wz-option>') );
		selCommentWidth.append( $('<wz-option value="20">20 m</wz-option>') );
		selCommentWidth.append( $('<wz-option value="25">25 m</wz-option>') );
		selCommentWidth.attr('value', getLastCommentWidth(DefaultCommentWidth));

		// Add MapCommentGeo section
		const rootContainer = $('<section id="MapCommentGeo" />');
		rootContainer.append($('<div class="form-group" />')); // add an empty form group just for the margin above

		// Add comment width to section
		const mapNoteWidthContainer = $('<div class="form-group" />');
		mapNoteWidthContainer.append( $('<wz-label>Map Note Width</wz-label>') );
		const mapNoteWidthControls = $('<div style="display: flex; gap: 12px;" />');
		mapNoteWidthControls.append(selCommentWidth);
		mapNoteWidthControls.append(createMapNoteBtn);
		mapNoteWidthContainer.append(mapNoteWidthControls);
		rootContainer.append(mapNoteWidthContainer);

		$("#segment-edit-general").append(rootContainer);

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
		const width = parseInt(selCommentWidth.value, 10);

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
