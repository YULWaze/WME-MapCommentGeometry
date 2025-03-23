// ==UserScript==
// @name 			WME MapCommentGeometry
// @author			YUL_
// @description 	This script creates a map note around a single selected road segment. It also allows you to create a camera or an arrow shaped note.
// @match			*://*.waze.com/*editor*
// @exclude			*://*.waze.com/user/editor*
// @grant 			none
// @require			https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @require			https://github.com/WazeSpace/wme-sdk-plus/releases/download/v1.0.2/wme-sdk-plus.min.js
// @require			https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js
// @downloadURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @updateURL		https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js
// @supportURL		https://github.com/YULWaze/WME-MapCommentGeometry/issues/new/choose
// @version 		2025.03.23.1
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
// Thanks to r0den for allowing the note to be created directly on the segment and cleaning up the code.  Also, r0den is a machine!

// Instructions
// 1) Install this script in Tampermonkey.
// 2) Select a road in WME (you can create a new one in the shape of the Map Note you want to make).
// 3) Choose the width of the Map Comment from the dropdown or keep the default.
// 4) Click the "Create New" button at the bottom of the left pane or click the "Use Existing" button and then click on an existing Map Note to change its geometry to surround the selected road segment.
// 5) If you want to convert a point note to a camera or arrow-shaped area, create a new Map Note or select an existing one, and then click the corresponding button.
// If required, use WME PIE to rotate the resulting shape.

/*
To do:

- Clean up and simplify the code

- This will sometimes create map comments with invalid geometry based on how the original road is shaped.
It could be interesting to simplify the map comment geometry accordingly.
See simplify.js by Volodymyr Agafonkin (https://github.com/mourner/simplify-js)

- Allow this script to place a map comment on multiple selected segments

- Feedback:
*/

(async function () {
  await SDK_INITIALIZED;
  const UPDATE_NOTES = "Added ability to infer width from selected segment";
  const SCRIPT_NAME = GM_info.script.name;
  const SCRIPT_VERSION = GM_info.script.version;
  const idTitle = 0;
  const idNewMapComment = 1;
  const idExistingMapComment = 2;
  const wmeSdk = getWmeSdk({ scriptId: "wme-map-comment-geometry", scriptName: "WME Map Comment Geometry" });
  initWmeSdkPlus(wmeSdk);

  const CameraLeftPoints = [
    [11, 6],
    [-4, 6],
    [-4, 3],
    [-11, 6],
    [-11, -6],
    [-4, -3],
    [-4, -6],
    [11, -6],
  ];
  const CameraRightPoints = [
    [-11, 6],
    [4, 6],
    [4, 3],
    [11, 6],
    [11, -6],
    [4, -3],
    [4, -6],
    [-11, -6],
  ];
  const CameraUpPoints = [
    [6, -11],
    [6, 4],
    [3, 4],
    [6, 11],
    [-6, 11],
    [-3, 4],
    [-6, 4],
    [-6, -11],
  ];
  const CameraDownPoints = [
    [6, 11],
    [6, -4],
    [3, -4],
    [6, -11],
    [-6, -11],
    [-3, -4],
    [-6, -4],
    [-6, 11],
  ];

  const ArrowRightPoints = [
    [0, -36],
    [0, -12],
    [5, -7],
    [12, -6],
    [24, -6],
    [24, -18],
    [36, 0],
    [24, 18],
    [24, 6],
    [12, 6],
    [2, 4],
    [-4, 2],
    [-8, -2],
    [-12, -9],
    [-12, -36],
  ];
  const ArrowLeftPoints = [
    [0, -36],
    [0, -12],
    [-5, -7],
    [-12, -6],
    [-24, -6],
    [-24, -18],
    [-36, 0],
    [-24, 18],
    [-24, 6],
    [-12, 6],
    [-2, 4],
    [4, 2],
    [8, -2],
    [12, -9],
    [12, -36],
  ];
  const ArrowStraightPoints = [
    [6, -18],
    [6, 6],
    [18, 6],
    [0, 18],
    [-18, 6],
    [-6, 6],
    [-6, -18],
  ];

  // Default widths of the Map Comment around the existing road depending on road type
  // sel.attributes.roadType: 1 = Street, 2 = PS, 3 = Freeway, 4 = Ramp, 6 = MH, 7 = mH, 8 = Offroad, 17 = Private, 20 = Parking lot
  //	const CommentWidths = [15,20,40,15,15,30,30];
  const DefaultCommentWidth = 10;
  let TheCommentWidth;

	function hasSelectedFeatures(featureType) {
		const selection = wmeSdk.Editing.getSelection();
		if (!selection) return false;
		return selection.objectType === featureType;
	}

	function addControlsToMapCommentEditPanel() {
		if (!hasSelectedFeatures('mapComment')) return;

		const lockRegion = $(".lock-edit-region");

		const createJoystick = (areas, buttons) => {
			const unassignedAreas = new Set(areas.flat());
			const maxControlsInRow = areas.reduce((currentMax, row) => Math.max(currentMax, row.length), 0);
			const cssAreas = areas
				.map((row) => {
					if (row.length === maxControlsInRow) return `"${row.join(" ")}" 1fr`;

					const singleAreaUnits = Math.floor(maxControlsInRow / row.length);
					const availableUnits = maxControlsInRow - singleAreaUnits * row.length;

					return row.reduce((result, currentArea, currentAreaIndex, areas) => {
						const isLastArea = currentAreaIndex + 1 >= areas.length;
						const insert = (times) => {
							for (let i = 0; i < times; i++) result.push(currentArea);
						};

						insert(singleAreaUnits);
						if (isLastArea) insert(availableUnits);

						return `"${result.join(" ")}" 1fr`;
					}, []);
				})
				.join(" ");

			const joystickContainer = $('<div style="display: grid; align-items: center;"/>');
			joystickContainer.css("grid-template", cssAreas);

			const buttonElements = {};
			buttons.forEach((button) => {
				const { name, icon, handler, isSelectable = true, flipIconVertically = false } = button;
				if (!unassignedAreas.has(name)) return;
				unassignedAreas.delete(name);

				const $icon = $(`<i class="w-icon w-icon-${icon}" />`);
				if (flipIconVertically) $icon.css("transform", "rotateX(180deg)");

				const $btn = $('<wz-button color="clear-icon" size="sm" />');
				$btn.css("grid-area", name);
				if (!isSelectable) {
					$btn.attr("disabled", true);
					$icon.css("color", "#000");
				}
				$btn.append($icon);
				$btn.click((e) => e.target.blur());
				if (handler) $btn.click(handler);
				joystickContainer.append($btn);
				buttonElements[name] = $btn;
			});

			Array.from(unassignedAreas.values()).forEach((area) => {
				const $dummy = $("<div />");
				$dummy.css("grid-area", area);
				joystickContainer.append($dummy);
			});

			return {
				root: joystickContainer,
				buttons: buttonElements,
			};
		};

		const DPAD_AREA = {
			Up: "up",
			Left: "left",
			Right: "right",
			Down: "down",
			Middle: "middle",
		};
		const DPAD_NAV_ICONS = {
			[DPAD_AREA.Up]: "arrow-up",
			[DPAD_AREA.Down]: "arrow-down",
			[DPAD_AREA.Left]: "arrow-left",
			[DPAD_AREA.Right]: "arrow-right",
			[DPAD_AREA.Middle]: "recenter",
		};
		const createDPadJoystick = (buttons, size = "100%") => {
			if (buttons.length < 4 || buttons.length > 5) throw new Error("There must be 4 or 5 buttons in a D-Pad");

			buttons.forEach((button) => {
				button.icon = button.icon || DPAD_NAV_ICONS[button.name];
			});

			const { root, buttons: buttonElements } = createJoystick(
				[[DPAD_AREA.Up], [DPAD_AREA.Left, DPAD_AREA.Middle, DPAD_AREA.Right], [DPAD_AREA.Down]],
				buttons
			);

			Object.entries(buttonElements).forEach(([btnName, $btn]) => {
				if (!Object.values(DPAD_AREA).includes(btnName)) return;

				$btn.css("justify-self", "center");
				$btn.css("width", "fit-content");
			});

			root.css("aspect-ratio", "1");
			root.css("max-width", size);
			root.css("background-color", "var(--surface_default)");
			root.css("border-radius", "50%");
			root.css("overflow", "hidden");
			return root;
		};

		const createDPadControl = (controlName, buttons, size = "100%") => {
			const $container = $('<div style="flex: 1" />');
			$container.append($(`<wz-label style="text-align: center">${controlName}</wz-label>`));
			$container.append(createDPadJoystick(buttons, size));
			return $container;
		};

		const joysticksContainers = $('<div class="form-group" style="display: flex; gap: 12px" />');
		joysticksContainers.append(
			createDPadControl("Cameras", [
				{ name: DPAD_AREA.Up, handler: createUCamera },
				{ name: DPAD_AREA.Down, handler: createDCamera },
				{ name: DPAD_AREA.Left, handler: createLCamera },
				{ name: DPAD_AREA.Right, handler: createRCamera },
				{ name: DPAD_AREA.Middle, handler: () => null, isSelectable: false, icon: "speed-camera" },
			])
		);
		joysticksContainers.append(
			createDPadControl("Arrows", [
				{ name: DPAD_AREA.Up, handler: createSArrow },
				{ name: "DUMMY", handler: () => null, isSelectable: false },
				{ name: DPAD_AREA.Left, icon: "turn-left", handler: createLArrow },
				{ name: DPAD_AREA.Right, icon: "turn-right", handler: createRArrow },
				{ name: DPAD_AREA.Middle, icon: "pencil", handler: createCustomArrow },
			])
		);

		lockRegion.before(joysticksContainers);
	}

  async function waitForMapCommentSelection() {
    if (hasSelectedFeatures('mapComment')) return wmeSdk.Editing.getSelection().ids[0];

    await wmeSdk.Events.once({
      eventName: "wme-selection-changed",
    });

    if (hasSelectedFeatures('mapComment')) return wmeSdk.Editing.getSelection().ids[0];
    return null;
  }

  function convertLineToArrow(line) {
    const lastPoint = line.coordinates[line.coordinates.length - 1];
    const secondLastPoint = line.coordinates[line.coordinates.length - 2];
    const direction = turf.bearing(turf.point(secondLastPoint), turf.point(lastPoint));

    const arrowSize = 10; // Arrow size in meters
    const leftWing = turf.destination(turf.point(lastPoint), arrowSize, direction + 90, { units: "meters" });
    const rightWing = turf.destination(turf.point(lastPoint), arrowSize, direction - 90, { units: "meters" });

    const surroundedLine = turf.buffer(line, arrowSize / 3, { units: "meters", steps: 4 });

    const arrowHead = turf.polygon([
      [
        lastPoint,
        leftWing.geometry.coordinates,
        turf.destination(turf.point(lastPoint), arrowSize, direction, { units: "meters" }).geometry.coordinates,
        rightWing.geometry.coordinates,
        lastPoint,
      ],
    ]);

    return turf.union(turf.featureCollection([surroundedLine, arrowHead])).geometry;
  }

  function updateSelectedFeatureGeometry(newGeometry) {
    const selection = wmeSdk.Editing.getSelection();
    if (!selection) {
      console.warn('updateSelectedFeatureGeometry has been called without active selection');
      return;
    }

    if (selection.ids.length > 1) {
      console.warn('updateSelectedFeatureGeometry has been called with multiple selected objects, only the first one will be updated');
    }

    switch (selection.objectType) {
      case 'mapComment':
        wmeSdk.DataModel.MapComments.updateMapComment({
          mapCommentId: selection.ids[0].toString(), // TODO: There is a bug currently with the SDK causing the update to fail due to type mismatch
          geometry: newGeometry,
        });
        break;
      case 'permanentHazard':
        updatePermanentHazard(selection.ids[0], { geometry: newGeometry });
        break;
      default:
        console.error('updateSelectedFeatureGeometry has been called but the selected feature is not supported: ' + selection.objectType);
        return;
    }
  }

  function getGeometryOfSelection() {
    const selection = wmeSdk.Editing.getSelection();
    if (!selection) return null;

    if (selection.ids.length > 1) {
      console.warn('getGeometryOfSelection has been called with multiple selected objects, only the first one will be returned');
    }

    switch (selection.objectType) {
      case 'mapComment':
        return wmeSdk.DataModel.MapComments.getById({ mapCommentId: selection.ids[0].toString() }).geometry;  // TODO: There is a bug currently with the SDK causing the update to fail due to type mismatch
      case 'permanentHazard':
        return getPermanentHazard(selection.ids[0]).geometry;
      default:
        console.warn('getGeometryOfSelection has been called but the selected feature is not supported: ' + selection.objectType);
        return null;
    }
  }

  function applyShapeToSelectedFeature(shapePoints) {
    const geometryCentroid = turf.centroid(getGeometryOfSelection()).geometry;
    const openLayersCentroid = W.userscripts.toOLGeometry(geometryCentroid);
    updateSelectedFeatureGeometry(getShapeWKT(shapePoints, openLayersCentroid));
  }

  function createLCamera() {
    applyShapeToSelectedFeature(CameraLeftPoints);
  }
  function createUCamera() {
    applyShapeToSelectedFeature(CameraUpPoints);
  }
  function createRCamera() {
    applyShapeToSelectedFeature(CameraRightPoints);
  }
  function createDCamera() {
    applyShapeToSelectedFeature(CameraDownPoints);
  }

  function createLArrow() {
    applyShapeToSelectedFeature(ArrowLeftPoints);
  }
  function createSArrow() {
    applyShapeToSelectedFeature(ArrowStraightPoints);
  }
  function createRArrow() {
    applyShapeToSelectedFeature(ArrowRightPoints);
  }
  async function createCustomArrow() {
    const drawnLine = await wmeSdk.Map.drawLine();
    const curvedLine = turf.bezierSpline(drawnLine, { sharpness: 0.1 }).geometry;
    const arrowGeometry = convertLineToArrow(curvedLine);
    updateSelectedFeatureGeometry(arrowGeometry);
  }

  function getShapeWKT(points, center) {
    if (!center) {
      if (!WazeWrap.hasMapCommentSelected()) throw new Error("No map comment selected and no center provided");
      const mapComment = WazeWrap.getSelectedDataModelObjects()[0];
      center = mapComment.getOLGeometry().getCentroid();
    }

    let wktText = "POLYGON((";
    for (let i = 0; i < points.length; i++) {
      wktText += `${center.x + points[i][0]} ${center.y + points[i][1]},`;
    }
    wktText = wktText.slice(0, -1);
    wktText += "))";
    return W.userscripts.toGeoJSONGeometry(OpenLayers.Geometry.fromWKT(wktText));
  }

  function WMEMapCommentGeometry_bootstrap() {
    var wazeapi = W || window.W;
    if (!wazeapi || !wazeapi.map || !WazeWrap.Interface) {
      setTimeout(WMEMapCommentGeometry_bootstrap, 1000);
      return;
    }

    WMEMapCommentGeometry_init();
  }

  function createSnackbar(options) {
    const { label, button, closeAutomatically = true, showCloseButton = true } = options;

    const $snackbarContainer = $('<wz-snackbar></wz-snackbar>')
    if (!showCloseButton) $snackbarContainer.attr('close-button', false);
    if (!closeAutomatically) $snackbarContainer.attr('close-automatically', false);
    $snackbarContainer.attr('align', 'center');
    $snackbarContainer.css('--wz-snackbar-position', 'absolute');

    const $textWrapper = $('<span></span>');
    $textWrapper.addClass('text-wrapper');
    $textWrapper.text(label);

    $snackbarContainer.append($textWrapper);

    let $btn = null;
    if (button) {
      const { label, onClick } = button;

      const $snackbarActions = $('<wz-snackbar-actions></wz-snackbar-actions>');
      $btn = $('<wz-button></wz-button>');
      $btn.attr('color', 'text');
      $btn.text(label);
      if (onClick) $btn.click(onClick);
      $snackbarActions.append($btn);

      $snackbarContainer.append($snackbarActions);
    }
    

    $('#map-message-container').append($snackbarContainer);
    return {
      show: () => $snackbarContainer[0].showSnackbar(),
      hide: () => $snackbarContainer[0].hideSnackbar(),
      remove: () => $snackbarContainer.remove(),
      button: $btn[0],
    }
  }

  function waitForEvent(element, eventName) {
    return new Promise((resolve) => {
      element.addEventListener(eventName, () => resolve(), { once: true });
    });
  }

  function getPermanentHazard(permanentHazardId) {
    const getters = {
      'camera': () => wmeSdk.DataModel.PermanentHazards.getCameraById({ cameraId: permanentHazardId }),
      'schoolZone': () => wmeSdk.DataModel.PermanentHazards.getSchoolZoneById({ schoolZoneId: permanentHazardId }),
    };

    const values = Object.entries(getters).map(([subtype, getter]) => {
      return [subtype, getter()];
    }).filter(([, value]) => !!value);

    if (values.length > 0) {
      console.warn('ambiguous result found in getPermanentHazard, returning the first one');
    }

    const [type, permanentHazard] = values[0];
    return {
      type,
      permanentHazard,
    };
  }

  function updatePermanentHazard(permanentHazardId, args) {
    const { type } = getPermanentHazard(permanentHazardId);

    switch (type) {
      case 'schoolZone':
        wmeSdk.DataModel.PermanentHazards.updateSchoolZone({
          schoolZoneId: permanentHazardId,
          ...args,
        });
        break;
      default:
        console.error('updatePermanentHazard has been called but the given permanent hazard is not supported: ' + type);
        break;  
    }
  }

  function WMEMapCommentGeometry_init() {
    try {
      let updateMonitor = new WazeWrap.Alerts.ScriptUpdateMonitor(
        SCRIPT_NAME,
        SCRIPT_VERSION,
        "https://raw.githubusercontent.com/YULWaze/WME-MapCommentGeometry/main/WME%20MapCommentGeometry.user.js",
        GM_xmlhttpRequest
      );
      updateMonitor.start();
    } catch (ex) {
      // Report, but don't stop if ScriptUpdateMonitor fails.
      console.log(ex.message);
    }

    var langText;

    function addWMESelectSegmentbutton() {
      if (!wmeSdk.Editing.getSelection()) return;
      if (document.getElementById("MapCommentGeo") !== null) return; // duplicate avoidance

      // Add button
      const createMapNoteBtn = $(
        `<wz-button style="--space-button-text: 100%;" size="sm" color="text">${getString(idNewMapComment)}</wz-button>`
      );
      createMapNoteBtn.click((e) => {
        e.target.blur();
				const mapCommentId = wmeSdk.DataModel.MapComments.addMapComment({
					geometry: getGeometryOfSelection(),
				});
				wmeSdk.Editing.setSelection({
					selection: {
						ids: [mapCommentId],
						objectType: 'mapComment',
					},
				});
      });

      const useMapNoteBtn = $(
        `<wz-button style="--space-button-text: 100%;" size="sm" color="text">${getString(
          idExistingMapComment
        )}</wz-button>`
      );
      useMapNoteBtn.click(async (e) => {
        e.target.blur();
        e.target.disabled = true;
        const selectionGeometry = getGeometryOfSelection();
        const snackbar = createSnackbar({
          label: 'Select an existing map comment to update its geometry',
          closeAutomatically: false,
          showCloseButton: false,
          button: {
            label: 'Cancel',
          }
        });
        snackbar.show();

        try {
          const mapCommentId = await Promise.race([
            waitForMapCommentSelection(),
            waitForEvent(snackbar.button, 'click').then(() => {
              throw new Error('CANCELLED');
            }),
          ]);
          if (!mapCommentId) return;
          wmeSdk.DataModel.MapComments.updateMapComment({
            mapCommentId,
            geometry: selectionGeometry,
          })
        } catch {} finally {
          e.target.disabled = false;
          snackbar.remove();
        }
      });

      // Add dropdown for comment width
      const selCommentWidth = $('<wz-select id="CommentWidth" style="flex: 1" />');
      selCommentWidth.append($('<wz-option value="SEG_WIDTH">Infer</wz-option>'));
      selCommentWidth.append($('<wz-option value="5">5 m</wz-option>'));
      selCommentWidth.append($('<wz-option value="10">10 m</wz-option>'));
      selCommentWidth.append($('<wz-option value="15">15 m</wz-option>'));
      selCommentWidth.append($('<wz-option value="20">20 m</wz-option>'));
      selCommentWidth.append($('<wz-option value="25">25 m</wz-option>'));
      const widthToSelect = getLastCommentWidth(NaN);
      selCommentWidth.attr("value", isNaN(widthToSelect) ? "SEG_WIDTH" : widthToSelect);
      const selCommentWidthStyles = new CSSStyleSheet();
      selCommentWidthStyles.replaceSync(".wz-select { min-width: initial !important }");
      selCommentWidth[0].shadowRoot.adoptedStyleSheets.push(selCommentWidthStyles);

      // Add MapCommentGeo section
      const rootContainer = $('<section id="MapCommentGeo" />');
      rootContainer.append($('<div class="form-group" />')); // add an empty form group just for the margin above

      // Add comment width to section
      const mapNoteWidthContainer = $('<div class="form-group" />');
      mapNoteWidthContainer.append($("<wz-label>Map Note Width</wz-label>"));
      const mapNoteWidthControls = $('<div style="display: flex; gap: 12px;" />');
      mapNoteWidthControls.append(selCommentWidth);
      mapNoteWidthControls.append(createMapNoteBtn, useMapNoteBtn);
      mapNoteWidthContainer.append(mapNoteWidthControls);
      rootContainer.append(mapNoteWidthContainer);

      $("#segment-edit-general").append(rootContainer);

      WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, SCRIPT_VERSION, UPDATE_NOTES, "");

      console.log("WME MapCommentGeometry");
    }

    function getSegmentsPath(segmentIds, getSegment, getConnectedSegments) {
      const visitedSegments = new Set();
      const forwardResult = [],
        backwardResult = [];

      // Convert segmentIds to a Set for quick lookup
      const validSegmentIds = new Set(segmentIds);

      // Start traversal from the first segment in the list
      const initialSegmentId = segmentIds[0];
      const { fromNodeId, toNodeId } = getSegment(initialSegmentId);

      // Queues for forward and backward traversal
      const forwardQueue = [];
      const backwardQueue = [];

      const addToQueue = (queue, nextNodeId) => {
        const connectedSegments = getConnectedSegments(nextNodeId);
        for (const connectedSegment of connectedSegments) {
          if (!validSegmentIds.has(connectedSegment) || visitedSegments.has(connectedSegment)) continue;
          queue.push({ segmentId: connectedSegment, currentNodeId: nextNodeId });
        }
      };

      forwardResult.push({ segmentId: initialSegmentId, direction: "fwd" });
      visitedSegments.add(initialSegmentId);
      addToQueue(forwardQueue, toNodeId);
      addToQueue(backwardQueue, fromNodeId);

      while (forwardQueue.length > 0) {
        const { segmentId, currentNodeId } = forwardQueue.shift();

        if (visitedSegments.has(segmentId)) continue;
        visitedSegments.add(segmentId);

        // Query segment details
        const { fromNodeId, toNodeId } = getSegment(segmentId);

        // Determine the segment's direction
        const direction = currentNodeId === fromNodeId ? "fwd" : "rev";
        forwardResult.push({ segmentId, direction });

        // Get the next node to traverse
        const nextNodeId = direction === "fwd" ? toNodeId : fromNodeId;
        addToQueue(forwardQueue, nextNodeId);
      }

      while (backwardQueue.length > 0) {
        const { segmentId, currentNodeId } = backwardQueue.shift();

        if (visitedSegments.has(segmentId)) continue;
        visitedSegments.add(segmentId);

        // Query segment details
        const { fromNodeId, toNodeId } = getSegment(segmentId);

        // Determine the segment's direction
        const direction = currentNodeId === fromNodeId ? "rev" : "fwd";
        backwardResult.push({ segmentId, direction });

        // Get the next node to traverse
        const nextNodeId = direction === "fwd" ? fromNodeId : toNodeId;
        addToQueue(backwardQueue, nextNodeId);
      }

      return [...backwardResult.reverse(), ...forwardResult];
    }

    function mergeSegmentsGeometry(segmentIds) {
      const segmentsPath = getSegmentsPath(
        segmentIds,
        (segmentId) => wmeSdk.DataModel.Segments.getById({ segmentId }),
        (nodeId) => wmeSdk.DataModel.Nodes.getById({ nodeId }).connectedSegmentIds
      );

      return segmentsPath.reduce((points, { segmentId, direction }) => {
        const segment = wmeSdk.DataModel.Segments.getById({ segmentId });
        const segmentGeometry = segment.geometry.coordinates;
        if (direction === "rev") segmentGeometry.reverse();

        // Remove the last point of the previous segment to avoid duplicate points
        if (points.length > 0) points.pop();
        return points.concat(segmentGeometry);
      }, []);
    }

    function getGeometryForSegments(segments, width) {
      const mergedGeometryCoordinates = mergeSegmentsGeometry(segments.map((segment) => segment.attributes.id));
      const mergedGeoJSONGeometry = {
        type: "LineString",
        coordinates: mergedGeometryCoordinates,
      };

      return convertToLandmark(mergedGeoJSONGeometry, width);
    }

    function ensureMetricUnits(value) {
      if (!value) return null;

      const userSettings = wmeSdk.Settings.getUserSettings();
      if (userSettings && !userSettings.isImperial) return value;

      const conversionFactor = 0.3048; // 1 foot = 0.3048 meters
      return Math.round(imperialValue * conversionFactor);
    }

    function getSegmentWidth(segmentId) {
      const segment = wmeSdk.DataModel.Segments.getById({ segmentId });
      if (!segment) {
        console.error(`Segment with ID ${segmentId} not found.`);
        return null;
      }

      const segmentAddress = wmeSdk.DataModel.Segments.getAddress({ segmentId });
      const defaultLaneWidth =
        (segmentAddress.country.defaultLaneWidthPerRoadType
          ? segmentAddress.country.defaultLaneWidthPerRoadType[segment.roadType]
          : 330) / 100;

      const averageNumberOfLanes =
        ((segment.fromLanesInfo?.numberOfLanes || 1) + (segment.toLanesInfo?.numberOfLanes || 1)) / 2;
      const averageLaneWidth =
        ((ensureMetricUnits(segment.fromLanesInfo?.laneWidth) || defaultLaneWidth) +
          (ensureMetricUnits(segment.toLanesInfo?.laneWidth) || defaultLaneWidth)) /
        2;
      return averageLaneWidth * averageNumberOfLanes;
    }

    function getWidthOfSegments(segmentIds) {
      const widths = segmentIds.map((segmentId) => getSegmentWidth(segmentId));
      const averageWidth = widths.reduce((sum, width) => sum + width, 0) / widths.length;
      return Math.round(averageWidth);
    }

    function getGeometryOfSelection(width) {
      if (!width || isNaN(width)) {
        const selCommentWidth = document.getElementById("CommentWidth");
        if (selCommentWidth.value === "SEG_WIDTH") {
          const selection = wmeSdk.Editing.getSelection();
          if (!selection || selection.objectType !== "segment") {
            console.error("No road selected!");
            return null;
          }

          width = getWidthOfSegments(selection.ids);
          setlastCommentWidth(NaN);
        } else {
          width = parseInt(selCommentWidth.value, 10);
          setlastCommentWidth(width);
        }
      }

      console.log(`Comment width: ${width}`);

      const selectedFeatures = W.selectionManager.getSelectedFeatures();
      if (selectedFeatures.length === 0) {
        console.error("No road selected!");
        return null;
      }

      const segments = selectedFeatures
        .map((feature) => feature._wmeObject)
        .filter((object) => object.type === "segment");

      return getGeometryForSegments(segments, width);
    }

    /**
     * Converts a GeoJSON geometry (usually a LineString) to a Landmark (Polygon) geometry.
     * @param geometry The GeoJSON geometry to convert.
     * @param width The width (in meters) of the landmark.
     */
    function convertToLandmark(geometry, width = TheCommentWidth) {
      return turf.buffer(geometry, width / 2, { units: "meters" }).geometry;
    }

    // 2013-06-09: Save current comment Width
    function setlastCommentWidth(CommentWidth) {
      if (typeof Storage !== "undefined") {
        // 2013-06-09: Yes! localStorage and sessionStorage support!
        if (!CommentWidth || isNaN(CommentWidth)) {
          // We want to use the default comment width, which is based on the selected segment
          // So we don't need to save it, and if we already have it in sessionStorage, we can remove it
          sessionStorage.removeItem("CommentWidth");
        }
        sessionStorage.CommentWidth = Number(CommentWidth);
      } else {
        // Sorry! No web storage support..
        console.log("No web storage support");
      }
    }

    // 2013-06-09: Returns last saved comment width
    function getLastCommentWidth(CommentWidth) {
      if (typeof Storage !== "undefined") {
        // 2013-06-09: Yes! localStorage and sessionStorage support!
        if (sessionStorage.CommentWidth) return Number(sessionStorage.CommentWidth);
        else return Number(CommentWidth); // Default comment width
      } else {
        return Number(CommentWidth); // Default comment width
      }
    }

    // 2014-06-05: Returns WME interface language
    function getLanguage() {
      var wmeLanguage;
      var urlParts;
      urlParts = location.pathname.split("/");
      wmeLanguage = urlParts[1].toLowerCase();
      if (wmeLanguage === "editor") {
        wmeLanguage = "us";
      }
      return wmeLanguage;
    }

    // 2014-06-05: Translate text to different languages
    function intLanguageStrings() {
      switch (getLanguage()) {
        default: // 2014-06-05: English
          langText = new Array("Select a road and click this button.", "Create New", "Use Existing");
      }
    }

    // 2014-06-05: Returns the translated string to current language, if the language is not recognized assumes English
    function getString(stringID) {
      return langText[stringID];
    }

    intLanguageStrings();

    W.selectionManager.events.register("selectionchanged", null, addWMESelectSegmentbutton);
    W.selectionManager.events.register("selectionchanged", null, addControlsToMapCommentEditPanel);
  }

  WMEMapCommentGeometry_bootstrap();
})();
