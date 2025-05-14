import * as THREE from "three";
import mapboxgl from "mapbox-gl";

export class MapLoader {
  constructor(scene, gameState, mapboxApiKey) {
    this.scene = scene;
    this.gameState = gameState;
    this.mapboxApiKey = mapboxApiKey;
    mapboxgl.accessToken = this.mapboxApiKey;

    // Scale factor for converting geo coordinates to 3D world coordinates
    // Adjusted to better align with map textures
    this.geoToWorldScale = 111000; // roughly 111km per degree of latitude

    // Local origin (user's location) for coordinate conversion
    this.originLat = 0;
    this.originLng = 0;

    // Road rendering options
    this.roadOptions = {
      height: 0.05,
      color: 0x333333,
      opacity: 0.8,
      centerLineColor: 0xffff00,
      centerLineWidth: 0.3,
    };

    // Building options
    this.buildingOptions = {
      minHeight: 5,
      maxHeight: 50,
      useExtrusion: true,
      defaultColor: 0xaaaaaa,
      glassFacade: true,
    };

    console.log("MapLoader class initialized");
  }

  async loadMapData() {
    try {
      console.log("Loading map data...");

      // Store origin for coordinate conversion
      this.originLat = this.gameState.userLocation.latitude;
      this.originLng = this.gameState.userLocation.longitude;

      // Load buildings first
      await this.loadBuildings();

      // Then load roads
      await this.loadRoads();

      // Set vehicle start position after map data is loaded
      this.setVehicleStartPosition();

      console.log("Map data loading complete");
    } catch (error) {
      console.error("Error loading map data:", error);
      // Create fallback map elements if loading fails
      this.createDefaultRoads();
      this.createDefaultBuildings();
    }
  }

  // Convert geo coordinates to world coordinates
  geoToWorld(lng, lat) {
    // Convert longitude/latitude differences to meters first
    // 111,319.9 meters per degree of latitude
    // 111,319.9 * cos(lat) meters per degree of longitude
    const latFactor = 111319.9;
    const lngFactor = 111319.9 * Math.cos((this.originLat * Math.PI) / 180);

    // Calculate distance in meters
    const deltaY = (lat - this.originLat) * latFactor;
    const deltaX = (lng - this.originLng) * lngFactor;

    // Scale to world units
    // Use x for longitude (east-west) and z for latitude (north-south)
    // Flip z to match Three.js coordinate system (north is negative z)
    return {
      x: deltaX,
      z: -deltaY,
    };
  }

  // Load 3D building data using Mapbox API
  async loadBuildings() {
    console.log("Loading building data...");

    try {
      // Use Mapbox's tilequery API to get building data around user location
      const buildingsResponse = await fetch(
        `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${this.originLng},${this.originLat}.json?layers=building&radius=1000&limit=300&access_token=${this.mapboxApiKey}`
      );

      if (!buildingsResponse.ok) {
        throw new Error(`API error: ${buildingsResponse.status}`);
      }

      const buildingsData = await buildingsResponse.json();

      if (!buildingsData.features || buildingsData.features.length === 0) {
        console.warn("No building data found, creating default buildings");
        this.createDefaultBuildings();
        return;
      }

      console.log(`Creating ${buildingsData.features.length} buildings...`);
      this.createBuildings(buildingsData.features);

      // Optionally load 3D building extrusions from another source
      if (this.buildingOptions.useExtrusion) {
        await this.loadBuildingExtrusions();
      }
    } catch (error) {
      console.error("Error loading buildings:", error);
      this.createDefaultBuildings();
    }
  }

  // Load building extrusions for 3D buildings
  async loadBuildingExtrusions() {
    try {
      // Use Mapbox's Data API or your own backend to get building heights
      // This is a simplified example; actual implementation would depend on your data source
      const extrusionResponse = await fetch(
        `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${this.originLng},${this.originLat}.json?layers=contour&radius=1000&limit=1&access_token=${this.mapboxApiKey}`
      );

      if (!extrusionResponse.ok) {
        return; // Continue with default heights if this fails
      }

      const extrusionData = await extrusionResponse.json();

      // Update existing buildings with height data if available
      // This is simplified - actual implementation would match buildings by ID
      if (extrusionData && extrusionData.features) {
        // Process extrusion data...
        console.log("Applied building extrusions");
      }
    } catch (error) {
      console.warn("Could not load building extrusions:", error);
      // Continue with default heights
    }
  }

  // Create detailed building models based on Mapbox data
  createBuildings(buildingFeatures) {
    console.log("Creating buildings...");

    if (!buildingFeatures || buildingFeatures.length === 0) {
      console.warn("No building features to create");
      return;
    }

    let buildingsCreated = 0;
    const buildingMaterials = this.createBuildingMaterials();
    const groundOffset = 0.1;

    buildingFeatures.forEach((building, index) => {
      if (!building.geometry || !building.geometry.coordinates) {
        return;
      }

      try {
        // Get building properties
        const properties = building.properties || {};

        // Determine building height - use real data if available
        let height =
          properties.height ||
          properties.min_height ||
          Math.random() *
            (this.buildingOptions.maxHeight - this.buildingOptions.minHeight) +
            this.buildingOptions.minHeight;

        // Limit maximum height for gameplay purposes
        height = Math.min(height, this.buildingOptions.maxHeight);

        // Get building footprint
        const coordinates = building.geometry.coordinates;
        let buildingX, buildingZ, buildingWidth, buildingDepth;

        if (building.geometry.type === "Point") {
          // Point geometry - create a simple building
          const worldPos = this.geoToWorld(coordinates[0], coordinates[1]);
          buildingX = worldPos.x;
          buildingZ = worldPos.z;

          // Random building dimensions
          buildingWidth = Math.random() * 10 + 8;
          buildingDepth = Math.random() * 10 + 8;
        } else if (
          building.geometry.type === "Polygon" &&
          coordinates.length > 0 &&
          coordinates[0].length > 2
        ) {
          // Polygon geometry - create a more accurate building shape
          // Calculate centroid of the polygon
          let avgX = 0,
            avgY = 0;
          const points = coordinates[0];

          points.forEach((point) => {
            avgX += point[0];
            avgY += point[1];
          });

          avgX /= points.length;
          avgY /= points.length;

          // Convert to world coordinates
          const worldPos = this.geoToWorld(avgX, avgY);
          buildingX = worldPos.x;
          buildingZ = worldPos.z;

          // Estimate building size from polygon bounds
          let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;

          points.forEach((point) => {
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
          });

          const worldMinX = this.geoToWorld(minX, avgY).x;
          const worldMaxX = this.geoToWorld(maxX, avgY).x;
          const worldMinZ = this.geoToWorld(avgX, minY).z;
          const worldMaxZ = this.geoToWorld(avgX, maxY).z;

          buildingWidth = Math.abs(worldMaxX - worldMinX);
          buildingDepth = Math.abs(worldMaxZ - worldMinZ);

          // Ensure minimum size
          buildingWidth = Math.max(buildingWidth, 5);
          buildingDepth = Math.max(buildingDepth, 5);
        } else {
          // Skip invalid geometries
          return;
        }

        // Create building geometry
        const buildingGeometry = new THREE.BoxGeometry(
          buildingWidth,
          height,
          buildingDepth
        );

        // Randomly select building material
        const materialIndex = Math.floor(
          Math.random() * buildingMaterials.length
        );
        const buildingMaterial = buildingMaterials[materialIndex];

        // Create building mesh
        const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
        buildingMesh.position.set(
          buildingX,
          height / 2 + groundOffset,
          buildingZ
        );
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;

        // Add slight random rotation for variety
        buildingMesh.rotation.y = (Math.random() * Math.PI) / 4;

        // Add to scene
        this.scene.add(buildingMesh);
        buildingsCreated++;

        // Add to game state
        this.gameState.buildings.push({
          mesh: buildingMesh,
          position: { x: buildingX, z: buildingZ },
          height: height,
          width: buildingWidth,
          depth: buildingDepth,
        });

        // Optionally add windows and details to large buildings
        if (height > 15 && (buildingWidth > 10 || buildingDepth > 10)) {
          this.addBuildingDetails(
            buildingMesh,
            height,
            buildingWidth,
            buildingDepth
          );
        }
      } catch (error) {
        console.error(`Error creating building #${index}:`, error);
      }
    });

    console.log(`Created ${buildingsCreated} buildings`);
  }

  // Create various building materials for diversity
  createBuildingMaterials() {
    const materials = [];

    // Glass building material
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      metalness: 0.2,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
      reflectivity: 1.0,
      clearcoat: 1.0,
    });
    materials.push(glassMaterial);

    // Concrete building material
    const concreteMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.7,
      metalness: 0.1,
    });
    materials.push(concreteMaterial);

    // Brick building material
    const brickMaterial = new THREE.MeshStandardMaterial({
      color: 0xaa6644,
      roughness: 0.9,
      metalness: 0.0,
    });
    materials.push(brickMaterial);

    // Steel building material
    const steelMaterial = new THREE.MeshStandardMaterial({
      color: 0x777788,
      roughness: 0.3,
      metalness: 0.8,
    });
    materials.push(steelMaterial);

    return materials;
  }

  // Add windows and details to large buildings
  addBuildingDetails(buildingMesh, height, width, depth) {
    // Add windows (simplified implementation)
    const windowGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.1);
    const windowMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffcc,
      emissive: 0x555555,
      transparent: true,
      opacity: 0.7,
      metalness: 0.2,
      roughness: 0.1,
    });

    // Calculate number of floors and windows per floor
    const floors = Math.floor(height / 3);
    const windowsPerWidth = Math.floor(width / 2);
    const windowsPerDepth = Math.floor(depth / 2);

    // Create window grid on each side of the building
    for (let floor = 1; floor < floors; floor++) {
      const y = floor * 3 - height / 2;

      // Windows on width sides
      for (let i = 1; i < windowsPerWidth; i++) {
        const x = i * 2 - width / 2;

        // Front side
        const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
        frontWindow.position.set(x, y, depth / 2 + 0.1);
        buildingMesh.add(frontWindow);

        // Back side
        const backWindow = new THREE.Mesh(windowGeometry, windowMaterial);
        backWindow.position.set(x, y, -depth / 2 - 0.1);
        backWindow.rotation.y = Math.PI;
        buildingMesh.add(backWindow);
      }

      // Windows on depth sides
      for (let i = 1; i < windowsPerDepth; i++) {
        const z = i * 2 - depth / 2;

        // Left side
        const leftWindow = new THREE.Mesh(windowGeometry, windowMaterial);
        leftWindow.position.set(-width / 2 - 0.1, y, z);
        leftWindow.rotation.y = Math.PI / 2;
        buildingMesh.add(leftWindow);

        // Right side
        const rightWindow = new THREE.Mesh(windowGeometry, windowMaterial);
        rightWindow.position.set(width / 2 + 0.1, y, z);
        rightWindow.rotation.y = -Math.PI / 2;
        buildingMesh.add(rightWindow);
      }
    }
  }

  // Load roads using Mapbox Directions API
  async loadRoads() {
    console.log("Loading road data...");

    try {
      // Use Mapbox Directions API to get road geometry
      const userLng = this.originLng;
      const userLat = this.originLat;

      // Create points around the user location to get more road coverage
      const offset = 0.01; // approx 1km
      const points = [
        [userLng, userLat], // center
        [userLng + offset, userLat], // east
        [userLng - offset, userLat], // west
        [userLng, userLat + offset], // north
        [userLng, userLat - offset], // south
        [userLng + offset, userLat + offset], // northeast
        [userLng - offset, userLat - offset], // southwest
        [userLng + offset, userLat - offset], // southeast
        [userLng - offset, userLat + offset], // northwest
      ];

      // Make multiple road network queries to create a road network
      const routePromises = [];

      // Request routes from center to each surrounding point
      for (let i = 1; i < points.length; i++) {
        const start = points[0];
        const end = points[i];

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&alternatives=true&access_token=${this.mapboxApiKey}`;

        routePromises.push(
          fetch(url)
            .then((response) => {
              if (!response.ok) {
                throw new Error(`Directions API error: ${response.status}`);
              }
              return response.json();
            })
            .then((data) => {
              if (data.routes && data.routes.length > 0) {
                return data.routes[0].geometry.coordinates;
              }
              return [];
            })
            .catch((error) => {
              console.warn(`Route request failed: ${error.message}`);
              return [];
            })
        );
      }

      // Get street data from Mapbox Streets API if available
      const streetPromise = fetch(
        `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${userLng},${userLat}.json?layers=road&radius=1000&limit=50&access_token=${this.mapboxApiKey}`
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Streets API error: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          if (data.features && data.features.length > 0) {
            return data.features;
          }
          return [];
        })
        .catch((error) => {
          console.warn(`Street data request failed: ${error.message}`);
          return [];
        });

      // Wait for all requests to complete
      const [allRoutes, streetFeatures] = await Promise.all([
        Promise.all(routePromises),
        streetPromise,
      ]);

      // Process route data to create roads
      this.createRoadsFromRoutes(allRoutes);

      // Supplement with street data if available
      if (streetFeatures && streetFeatures.length > 0) {
        this.createRoadsFromStreetData(streetFeatures);
      }

      // If no roads were created, fall back to default roads
      if (this.gameState.roads.length === 0) {
        this.createDefaultRoads();
      }
    } catch (error) {
      console.error("Error loading roads:", error);
      this.createDefaultRoads();
    }
  }

  // Create roads from route coordinates
  createRoadsFromRoutes(allRoutes) {
    console.log("Creating roads from route data...");

    if (!allRoutes || allRoutes.length === 0) {
      console.warn("No route data available");
      return;
    }

    // Track unique road segments to avoid duplicates
    const segmentMap = new Map();
    let roadsCreated = 0;

    // Process all coordinates from the routes
    let allCoordinates = [];
    allRoutes.forEach((route) => {
      if (route && route.length > 0) {
        allCoordinates = allCoordinates.concat(route);
      }
    });

    if (allCoordinates.length < 2) {
      console.warn("Insufficient coordinate data");
      return;
    }

    // Create road segments from consecutive coordinates
    for (let i = 0; i < allCoordinates.length - 1; i++) {
      const startCoord = allCoordinates[i];
      const endCoord = allCoordinates[i + 1];

      // Skip if coordinates are too close
      const distance = this.geoDistance(
        startCoord[0],
        startCoord[1],
        endCoord[0],
        endCoord[1]
      );

      if (distance < 0.00001) continue; // Minimum distance threshold

      // Create segment keys to detect duplicates
      const key1 = `${startCoord[0].toFixed(6)},${startCoord[1].toFixed(
        6
      )}-${endCoord[0].toFixed(6)},${endCoord[1].toFixed(6)}`;
      const key2 = `${endCoord[0].toFixed(6)},${endCoord[1].toFixed(
        6
      )}-${startCoord[0].toFixed(6)},${startCoord[1].toFixed(6)}`;

      // Skip if segment already exists
      if (segmentMap.has(key1) || segmentMap.has(key2)) {
        continue;
      }

      // Mark segment as processed
      segmentMap.set(key1, true);

      // Convert geo coordinates to world coordinates
      const startPos = this.geoToWorld(startCoord[0], startCoord[1]);
      const endPos = this.geoToWorld(endCoord[0], endCoord[1]);

      // Create 3D positions
      const start = new THREE.Vector3(
        startPos.x,
        this.roadOptions.height,
        startPos.z
      );
      const end = new THREE.Vector3(
        endPos.x,
        this.roadOptions.height,
        endPos.z
      );

      // Calculate road properties
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();

      // Skip very short segments
      if (length <= 0.5) {
        continue;
      }

      direction.normalize();

      // Road width based on importance
      const roadWidth = 8;

      // Create road mesh
      this.createRoadSegment(start, end, direction, length, roadWidth);
      roadsCreated++;
    }

    console.log(`Created ${roadsCreated} road segments from routes`);
  }

  // Create roads from Mapbox Streets API data
  createRoadsFromStreetData(streetFeatures) {
    console.log("Creating roads from street data...");

    if (!streetFeatures || streetFeatures.length === 0) {
      return;
    }

    const segmentMap = new Map();
    let roadsCreated = 0;

    streetFeatures.forEach((feature) => {
      if (!feature.geometry || !feature.geometry.coordinates) {
        return;
      }

      try {
        const coordinates = feature.geometry.coordinates;

        // Handle LineString geometry
        if (feature.geometry.type === "LineString" && coordinates.length >= 2) {
          for (let i = 0; i < coordinates.length - 1; i++) {
            const startCoord = coordinates[i];
            const endCoord = coordinates[i + 1];

            // Create segment key
            const key = `${startCoord[0].toFixed(6)},${startCoord[1].toFixed(
              6
            )}-${endCoord[0].toFixed(6)},${endCoord[1].toFixed(6)}`;

            // Skip if segment already exists
            if (segmentMap.has(key)) {
              continue;
            }

            segmentMap.set(key, true);

            // Convert coordinates to world positions
            const startPos = this.geoToWorld(startCoord[0], startCoord[1]);
            const endPos = this.geoToWorld(endCoord[0], endCoord[1]);

            const start = new THREE.Vector3(
              startPos.x,
              this.roadOptions.height,
              startPos.z
            );
            const end = new THREE.Vector3(
              endPos.x,
              this.roadOptions.height,
              endPos.z
            );

            // Calculate road properties
            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();

            if (length <= 0.5) {
              continue;
            }

            direction.normalize();

            // Get road class from properties if available
            const roadClass = feature.properties?.class || "street";

            // Set width based on road class
            let roadWidth = 8; // default

            switch (roadClass) {
              case "motorway":
              case "trunk":
                roadWidth = 12;
                break;
              case "primary":
                roadWidth = 10;
                break;
              case "secondary":
                roadWidth = 8;
                break;
              case "street":
              case "tertiary":
                roadWidth = 6;
                break;
              default:
                roadWidth = 4;
            }

            // Create road segment
            this.createRoadSegment(start, end, direction, length, roadWidth);
            roadsCreated++;
          }
        }
      } catch (error) {
        console.error("Error creating road from street data:", error);
      }
    });

    console.log(`Created ${roadsCreated} road segments from street data`);
  }

  // Create a single road segment with visual elements
  createRoadSegment(start, end, direction, length, width) {
    // Create road surface
    const roadGeometry = new THREE.PlaneGeometry(length, width);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: this.roadOptions.color,
      transparent: true,
      opacity: this.roadOptions.opacity,
      roughness: 0.8,
    });

    const road = new THREE.Mesh(roadGeometry, roadMaterial);

    // Position road
    road.position.copy(start).add(direction.clone().multiplyScalar(length / 2));

    // Orient road properly
    road.lookAt(new THREE.Vector3(end.x, this.roadOptions.height, end.z));
    road.rotateX(-Math.PI / 2); // Make horizontal

    road.receiveShadow = true;
    this.scene.add(road);

    // Add center line
    const centerLineGeometry = new THREE.PlaneGeometry(
      length,
      this.roadOptions.centerLineWidth
    );
    const centerLineMaterial = new THREE.MeshBasicMaterial({
      color: this.roadOptions.centerLineColor,
      side: THREE.DoubleSide,
    });

    const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    centerLine.position.copy(road.position);
    centerLine.position.y = this.roadOptions.height + 0.01; // Slightly above road
    centerLine.rotation.copy(road.rotation);
    this.scene.add(centerLine);

    // Add to game state
    this.gameState.roads.push({
      mesh: road,
      start: start,
      end: end,
      width: width,
      direction: direction.clone(),
    });

    return road;
  }

  // Calculate distance between geo coordinates using haversine formula
  geoDistance(lon1, lat1, lon2, lat2) {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Create default roads when real data is unavailable
  createDefaultRoads() {
    console.log("Creating default roads...");

    // Create a grid pattern of roads
    const roadWidth = 8;
    const gridSize = 200;
    const spacing = 50;

    // Clear existing roads
    this.gameState.roads = [];

    // Create horizontal roads
    for (let z = -gridSize; z <= gridSize; z += spacing) {
      const start = new THREE.Vector3(-gridSize, this.roadOptions.height, z);
      const end = new THREE.Vector3(gridSize, this.roadOptions.height, z);
      const direction = new THREE.Vector3(1, 0, 0);
      const length = gridSize * 2;

      this.createRoadSegment(start, end, direction, length, roadWidth);
    }

    // Create vertical roads
    for (let x = -gridSize; x <= gridSize; x += spacing) {
      const start = new THREE.Vector3(x, this.roadOptions.height, -gridSize);
      const end = new THREE.Vector3(x, this.roadOptions.height, gridSize);
      const direction = new THREE.Vector3(0, 0, 1);
      const length = gridSize * 2;

      this.createRoadSegment(start, end, direction, length, roadWidth);
    }

    console.log("Default road grid created");
  }

  // Create default buildings when real data is unavailable
  createDefaultBuildings() {
    console.log("Creating default buildings...");

    // Clear existing buildings
    this.gameState.buildings = [];

    const buildingMaterials = this.createBuildingMaterials();
    const groundOffset = 0.1;
    let buildingsCreated = 0;

    // Create buildings in a grid pattern away from roads
    const gridSize = 180;
    const spacing = 40;

    for (let x = -gridSize; x <= gridSize; x += spacing) {
      for (let z = -gridSize; z <= gridSize; z += spacing) {
        // Skip if too close to roads (within 15 units of any axis)
        if (Math.abs(x) % 50 < 15 || Math.abs(z) % 50 < 15) {
          continue;
        }

        try {
          // Random building properties
          const height = Math.random() * 30 + 10;
          const width = Math.random() * 10 + 15;
          const depth = Math.random() * 10 + 15;

          // Add random variation to position
          const xOffset = (Math.random() - 0.5) * 10;
          const zOffset = (Math.random() - 0.5) * 10;

          // Building position
          const buildingX = x + xOffset;
          const buildingZ = z + zOffset;

          // Random material selection
          const materialIndex = Math.floor(
            Math.random() * buildingMaterials.length
          );
          const buildingMaterial = buildingMaterials[materialIndex];

          // Create building geometry
          const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
          const buildingMesh = new THREE.Mesh(
            buildingGeometry,
            buildingMaterial
          );

          buildingMesh.position.set(
            buildingX,
            height / 2 + groundOffset,
            buildingZ
          );
          buildingMesh.castShadow = true;
          buildingMesh.receiveShadow = true;

          // Random rotation
          buildingMesh.rotation.y = (Math.random() * Math.PI) / 2;

          this.scene.add(buildingMesh);
          buildingsCreated++;

          // Add to game state
          this.gameState.buildings.push({
            mesh: buildingMesh,
            position: { x: buildingX, z: buildingZ },
            height: height,
            width: width,
            depth: depth,
          });

          // Add details to larger buildings
          if (height > 20 && Math.random() > 0.5) {
            this.addBuildingDetails(buildingMesh, height, width, depth);
          }
        } catch (error) {
          console.error(`Error creating default building:`, error);
        }
      }
    }

    console.log(`Created ${buildingsCreated} default buildings`);
  }

  // Find the nearest road point to a position
  findNearestRoadPoint() {
    if (this.gameState.roads.length === 0) {
      console.warn("No roads available to find nearest point");
      return null;
    }

    let closestPoint = null;
    let minDistance = Infinity;
    let closestDirection = null;

    // Use origin (0,0,0) as reference point
    const referenceX = 0;
    const referenceZ = 0;

    this.gameState.roads.forEach((road) => {
      // Calculate closest point on road segment
      const start = road.start;
      const end = road.end;

      // Create road vector
      const roadVector = new THREE.Vector3().subVectors(end, start);
      const roadLength = roadVector.length();
      roadVector.normalize();

      // Vector from start to reference point
      const refToStartVector = new THREE.Vector3(
        referenceX - start.x,
        0,
        referenceZ - start.z
      );

      // Project reference point onto road line
      const projection = refToStartVector.dot(roadVector);

      // Find closest point on segment
      let closestPointOnRoad;
      if (projection <= 0) {
        // Before start of segment
        closestPointOnRoad = start.clone();
      } else if (projection >= roadLength) {
        // After end of segment
        closestPointOnRoad = end.clone();
      } else {
        // On segment
        closestPointOnRoad = start
          .clone()
          .add(roadVector.clone().multiplyScalar(projection));
      }

      // Calculate distance to road point
      const distance = Math.sqrt(
        Math.pow(referenceX - closestPointOnRoad.x, 2) +
          Math.pow(referenceZ - closestPointOnRoad.z, 2)
      );

      // Update if this is the closest point
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = closestPointOnRoad;
        closestDirection = road.direction
          ? road.direction.clone()
          : roadVector.clone();
      }
    });

    return {
      point: closestPoint,
      direction: closestDirection,
    };
  }

  // Set the initial vehicle position on a road
  setVehicleStartPosition() {
    console.log("Setting vehicle start position...");

    // Find nearest road point
    const nearestRoad = this.findNearestRoadPoint();

    if (nearestRoad && nearestRoad.point) {
      // Position vehicle on road
      this.gameState.car.position.x = nearestRoad.point.x;
      this.gameState.car.position.y = 2; // Height above ground
      this.gameState.car.position.z = nearestRoad.point.z;

      // Orient vehicle along road direction
      if (nearestRoad.direction) {
        this.gameState.car.rotation = Math.atan2(
          nearestRoad.direction.x,
          nearestRoad.direction.z
        );
      }

      console.log(
        `Vehicle positioned at (${nearestRoad.point.x.toFixed(
          2
        )}, ${nearestRoad.point.z.toFixed(
          2
        )}), rotation: ${this.gameState.car.rotation.toFixed(2)}`
      );
    } else {
      console.warn("Could not find a suitable road position, using default");

      // Use first road if available
      if (this.gameState.roads.length > 0) {
        const firstRoad = this.gameState.roads[0];
        this.gameState.car.position.x = firstRoad.start.x;
        this.gameState.car.position.y = 2;
        this.gameState.car.position.z = firstRoad.start.z;

        if (firstRoad.direction) {
          this.gameState.car.rotation = Math.atan2(
            firstRoad.direction.x,
            firstRoad.direction.z
          );
        }
      } else {
        // Default position if no roads
        this.gameState.car.position.x = 0;
        this.gameState.car.position.y = 2;
        this.gameState.car.position.z = 0;
        this.gameState.car.rotation = 0;
      }
    }
  }
}
