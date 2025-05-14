import * as THREE from "three";
import mapboxgl from "mapbox-gl";

export class MapLoader {
  constructor(scene, gameState, mapboxApiKey) {
    this.scene = scene;
    this.gameState = gameState;
    this.mapboxApiKey = mapboxApiKey;
    mapboxgl.accessToken = this.mapboxApiKey;

    // 지리 좌표를 3D 좌표로 변환하는 스케일 팩터
    this.geoToWorldScale = 100000;

    // 도로 렌더링 옵션
    this.roadOptions = {
      height: 0.05, // 도로 높이 (바닥보다 약간 위에)
      color: 0x333333, // 도로 색상
      opacity: 0.6, // 도로 불투명도 (지도 위에 보이도록)
      centerLineColor: 0xffff00, // 중앙선 색상
      centerLineWidth: 0.3, // 중앙선 너비
    };

    console.log("MapLoader 클래스 생성됨");
  }

  async loadMapData() {
    try {
      console.log("맵 데이터 로드 시작...");

      // 도로 데이터 가져오기 - Mapbox Directions API 사용 (더 정확한 도로 데이터)
      try {
        // 사용자 위치를 중심으로 여러 경로 포인트를 설정하여 더 많은 도로 확보
        const userLng = this.gameState.userLocation.longitude;
        const userLat = this.gameState.userLocation.latitude;

        // 다양한 방향의 경로 포인트 설정 (사용자 위치 주변 1km 반경)
        const offset = 0.01; // 약 1km
        const points = [
          [userLng, userLat],
          [userLng + offset, userLat],
          [userLng - offset, userLat],
          [userLng, userLat + offset],
          [userLng, userLat - offset],
          [userLng + offset, userLat + offset],
          [userLng - offset, userLat - offset],
          [userLng + offset, userLat - offset],
          [userLng - offset, userLat + offset],
        ];

        // 주변 도로 네트워크 구성을 위해 여러 경로 요청
        const routePromises = [];

        // 중앙에서 여러 방향으로 경로 요청
        for (let i = 1; i < points.length; i++) {
          const start = points[0]; // 사용자 위치 (중앙)
          const end = points[i]; // 주변 포인트

          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&access_token=${this.mapboxApiKey}`;

          routePromises.push(
            fetch(url)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(
                    `Directions API 응답 오류: ${response.status}`
                  );
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
                console.warn(`경로 요청 실패: ${error.message}`);
                return [];
              })
          );
        }

        // 모든 경로 요청 결과 수집
        const allRoutes = await Promise.all(routePromises);

        // 중복 없이 도로 생성
        this.createRoadsFromRoutes(allRoutes);
      } catch (directionsError) {
        console.error("Directions API 요청 실패:", directionsError);
        this.createDefaultRoads();
      }

      // 건물 데이터 가져오기
      try {
        const buildingsResponse = await fetch(
          `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${this.gameState.userLocation.longitude},${this.gameState.userLocation.latitude}.json?layers=building&radius=1000&limit=100&access_token=${this.mapboxApiKey}`
        );

        if (!buildingsResponse.ok) {
          throw new Error(`API 응답 오류: ${buildingsResponse.status}`);
        }

        const buildingsData = await buildingsResponse.json();
        console.log(
          "건물 데이터 로드 완료:",
          buildingsData.features?.length || 0,
          "개 항목"
        );

        // 건물 생성
        this.createBuildings(buildingsData.features);
      } catch (error) {
        console.error("건물 데이터 가져오기 실패:", error);
        this.createDefaultBuildings();
      }

      // 시작 위치 설정 - 사용자 위치에서 가장 가까운 도로 위치로
      this.setVehicleStartPosition();

      console.log("맵 데이터 로드 완료");
    } catch (error) {
      console.error("맵 데이터를 가져오는 중 오류 발생:", error);
      // 오류 시 기본 맵 생성
      this.createDefaultRoads();
      this.createDefaultBuildings();
    }
  }

  // 여러 경로의 좌표로 도로 생성 (중복 제거)
  createRoadsFromRoutes(allRoutes) {
    console.log("경로 데이터로 도로 생성 시작...");

    if (!allRoutes || allRoutes.length === 0) {
      console.log("경로 데이터 없음, 기본 도로 생성");
      this.createDefaultRoads();
      return;
    }

    // 모든 좌표 포인트 수집
    let allCoordinates = [];
    allRoutes.forEach((route) => {
      if (route && route.length > 0) {
        allCoordinates = allCoordinates.concat(route);
      }
    });

    if (allCoordinates.length < 2) {
      console.log("유효한 경로 데이터 없음, 기본 도로 생성");
      this.createDefaultRoads();
      return;
    }

    console.log(`총 ${allCoordinates.length}개 좌표 포인트로 도로 생성`);

    // 중복 좌표 제거를 위한 맵
    const segmentMap = new Map();
    let roadsCreated = 0;

    // 각 경로에 대해 도로 세그먼트 생성
    for (let i = 0; i < allCoordinates.length - 1; i++) {
      const startCoord = allCoordinates[i];
      const endCoord = allCoordinates[i + 1];

      // 너무 가까운 점 무시
      const dist = this.geoDistance(
        startCoord[0],
        startCoord[1],
        endCoord[0],
        endCoord[1]
      );
      if (dist < 0.00001) continue; // 최소 거리 제한

      // 세그먼트 키 생성 (양방향 중복 방지)
      const key1 = `${startCoord[0].toFixed(6)},${startCoord[1].toFixed(
        6
      )}-${endCoord[0].toFixed(6)},${endCoord[1].toFixed(6)}`;
      const key2 = `${endCoord[0].toFixed(6)},${endCoord[1].toFixed(
        6
      )}-${startCoord[0].toFixed(6)},${startCoord[1].toFixed(6)}`;

      // 이미 처리한 세그먼트인지 확인
      if (segmentMap.has(key1) || segmentMap.has(key2)) {
        continue;
      }

      // 세그먼트 맵에 추가
      segmentMap.set(key1, true);

      // 지리 좌표를 Three.js 좌표로 변환
      const startX =
        (startCoord[0] - this.gameState.userLocation.longitude) *
        this.geoToWorldScale;
      const startZ =
        (startCoord[1] - this.gameState.userLocation.latitude) *
        this.geoToWorldScale;
      const endX =
        (endCoord[0] - this.gameState.userLocation.longitude) *
        this.geoToWorldScale;
      const endZ =
        (endCoord[1] - this.gameState.userLocation.latitude) *
        this.geoToWorldScale;

      const start = new THREE.Vector3(startX, this.roadOptions.height, startZ);
      const end = new THREE.Vector3(endX, this.roadOptions.height, endZ);

      // 두 점 사이의 거리와 방향 계산
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();

      if (length <= 0.1) {
        continue; // 너무 짧은 세그먼트는 건너뜀
      }

      direction.normalize();

      // 도로 너비 계산 (도로 등급에 따라 다르게 설정)
      let roadWidth = 5; // 기본 도로 너비

      // 도로 세그먼트 생성
      const roadGeometry = new THREE.PlaneGeometry(length, roadWidth);
      const roadMaterial = new THREE.MeshStandardMaterial({
        color: this.roadOptions.color,
        transparent: true,
        opacity: this.roadOptions.opacity,
        roughness: 0.6,
      });

      const road = new THREE.Mesh(roadGeometry, roadMaterial);

      // 회전 및 위치 설정
      road.position.copy(start).add(direction.multiplyScalar(length / 2));

      // 도로 방향 정렬
      road.lookAt(new THREE.Vector3(end.x, this.roadOptions.height, end.z));
      road.rotateX(-Math.PI / 2); // 바닥에 평행하게

      road.receiveShadow = true;
      this.scene.add(road);
      roadsCreated++;

      // 도로 표시 - 중앙선 (노란색)
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
      centerLine.position.y = this.roadOptions.height + 0.01; // 도로 위에 살짝 띄움
      centerLine.rotation.copy(road.rotation);
      this.scene.add(centerLine);

      // 게임 상태에 도로 추가
      this.gameState.roads.push({
        mesh: road,
        start: start,
        end: end,
        width: roadWidth,
        direction: direction.clone(),
      });
    }

    console.log(`도로 생성 완료: ${roadsCreated}개 생성됨`);
  }

  // 두 지리 좌표 사이의 거리 계산 (하버사인 공식)
  geoDistance(lon1, lat1, lon2, lat2) {
    const R = 6371; // 지구 반경 (km)
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // 기존 createRoads 메소드는 필요 없으므로 제거하거나 대체

  createDefaultRoads() {
    console.log("기본 도로 생성 중...");

    // 십자형 도로 생성
    const roadWidth = 8;

    // 수평 도로
    const horizontalRoadGeometry = new THREE.PlaneGeometry(200, roadWidth);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: this.roadOptions.color,
      transparent: true,
      opacity: this.roadOptions.opacity,
      roughness: 0.6,
    });

    const horizontalRoad = new THREE.Mesh(horizontalRoadGeometry, roadMaterial);
    horizontalRoad.rotation.x = -Math.PI / 2;
    horizontalRoad.position.y = this.roadOptions.height;
    horizontalRoad.receiveShadow = true;
    this.scene.add(horizontalRoad);

    // 수평 도로 중앙선
    const horizontalCenterLineGeometry = new THREE.PlaneGeometry(
      200,
      this.roadOptions.centerLineWidth
    );
    const centerLineMaterial = new THREE.MeshBasicMaterial({
      color: this.roadOptions.centerLineColor,
      side: THREE.DoubleSide,
    });
    const horizontalCenterLine = new THREE.Mesh(
      horizontalCenterLineGeometry,
      centerLineMaterial
    );
    horizontalCenterLine.rotation.x = -Math.PI / 2;
    horizontalCenterLine.position.y = this.roadOptions.height + 0.01;
    this.scene.add(horizontalCenterLine);

    // 수직 도로
    const verticalRoadGeometry = new THREE.PlaneGeometry(roadWidth, 200);
    const verticalRoad = new THREE.Mesh(verticalRoadGeometry, roadMaterial);
    verticalRoad.rotation.x = -Math.PI / 2;
    verticalRoad.position.y = this.roadOptions.height;
    verticalRoad.receiveShadow = true;
    this.scene.add(verticalRoad);

    // 수직 도로 중앙선
    const verticalCenterLineGeometry = new THREE.PlaneGeometry(
      this.roadOptions.centerLineWidth,
      200
    );
    const verticalCenterLine = new THREE.Mesh(
      verticalCenterLineGeometry,
      centerLineMaterial
    );
    verticalCenterLine.rotation.x = -Math.PI / 2;
    verticalCenterLine.position.y = this.roadOptions.height + 0.01;
    this.scene.add(verticalCenterLine);

    // 게임 상태에 도로 추가
    const horizontalDirection = new THREE.Vector3(1, 0, 0);
    const verticalDirection = new THREE.Vector3(0, 0, 1);

    this.gameState.roads.push({
      mesh: horizontalRoad,
      start: new THREE.Vector3(-100, this.roadOptions.height, 0),
      end: new THREE.Vector3(100, this.roadOptions.height, 0),
      width: roadWidth,
      direction: horizontalDirection,
    });

    this.gameState.roads.push({
      mesh: verticalRoad,
      start: new THREE.Vector3(0, this.roadOptions.height, -100),
      end: new THREE.Vector3(0, this.roadOptions.height, 100),
      width: roadWidth,
      direction: verticalDirection,
    });

    console.log("기본 도로 생성 완료");
  }

  createBuildings(buildingFeatures) {
    console.log("건물 생성 시작...");

    if (!buildingFeatures || buildingFeatures.length === 0) {
      console.log("건물 데이터 없음, 기본 건물 생성");
      this.createDefaultBuildings();
      return;
    }

    let buildingsCreated = 0;

    buildingFeatures.forEach((building, index) => {
      if (!building.geometry || !building.geometry.coordinates) {
        console.warn(`건물 #${index}: 좌표 데이터 없음`);
        return;
      }

      try {
        // 건물 높이 (임의 또는 데이터에서 가져옴)
        let height =
          building.properties && building.properties.height
            ? building.properties.height
            : Math.random() * 30 + 10;

        // 높이가 너무 높으면 제한 (게임 플레이 경험을 위해)
        height = Math.min(height, 50);

        // 지리 좌표를 Three.js 좌표로 변환
        const coordinates = building.geometry.coordinates;
        let x, z;

        if (Array.isArray(coordinates) && coordinates.length >= 1) {
          if (Array.isArray(coordinates[0]) && coordinates[0].length >= 2) {
            // 폴리곤 형식 - 첫 번째 좌표 사용
            x =
              (coordinates[0][0] - this.gameState.userLocation.longitude) *
              this.geoToWorldScale;
            z =
              (coordinates[0][1] - this.gameState.userLocation.latitude) *
              this.geoToWorldScale;
          } else if (coordinates.length >= 2) {
            // 점 형식
            x =
              (coordinates[0] - this.gameState.userLocation.longitude) *
              this.geoToWorldScale;
            z =
              (coordinates[1] - this.gameState.userLocation.latitude) *
              this.geoToWorldScale;
          } else {
            console.warn(`건물 #${index}: 좌표 형식 오류`);
            return;
          }
        } else {
          console.warn(`건물 #${index}: 좌표 데이터 오류`);
          return;
        }

        if (isNaN(x) || isNaN(z) || isNaN(height)) {
          console.warn(`건물 #${index}: NaN 값 포함 [${x}, ${z}, ${height}]`);
          return;
        }

        // 건물 크기 (폴리곤 크기에 따라 다르게 설정)
        const buildingWidth = Math.random() * 5 + 8;
        const buildingDepth = Math.random() * 5 + 8;

        // 랜덤 색상 (회색 계열)
        const r = 0.5 + Math.random() * 0.2;
        const g = 0.5 + Math.random() * 0.2;
        const b = 0.5 + Math.random() * 0.2;
        const color = new THREE.Color(r, g, b);

        // 바닥에서 약간 높게 설정하여 지도 텍스처와 겹치지 않도록
        const groundOffset = 0.1;

        // 간단한 박스로 건물 표현
        const buildingGeometry = new THREE.BoxGeometry(
          buildingWidth,
          height,
          buildingDepth
        );
        const buildingMaterial = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.7,
        });

        const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
        buildingMesh.position.set(x, height / 2 + groundOffset, z);
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;

        // 건물에 약간의 랜덤 회전 추가
        buildingMesh.rotation.y = Math.random() * Math.PI * 2;

        this.scene.add(buildingMesh);
        buildingsCreated++;

        // 게임 상태에 건물 추가
        this.gameState.buildings.push({
          mesh: buildingMesh,
          position: { x, z },
          height: height,
          width: buildingWidth,
          depth: buildingDepth,
        });
      } catch (error) {
        console.error(`건물 #${index} 생성 중 오류:`, error);
      }
    });

    console.log(`건물 생성 완료: ${buildingsCreated}개 생성됨`);
  }

  createDefaultBuildings() {
    console.log("기본 건물 생성 중...");

    // 도로 주변에 무작위 건물 생성
    let buildingsCreated = 0;
    const groundOffset = 0.1; // 바닥으로부터 약간 띄우기

    for (let i = 0; i < 50; i++) {
      try {
        const height = Math.random() * 30 + 10;
        const width = Math.random() * 5 + 8;
        const depth = Math.random() * 5 + 8;

        // 도로 주변에 무작위 위치 (도로에서 약간 떨어진 위치)
        let x, z;

        // 도로에서 충분히 떨어진 위치 찾기
        do {
          x = Math.random() * 180 - 90;
          z = Math.random() * 180 - 90;
        } while (
          (Math.abs(x) < 10 && Math.abs(z) < 100) || // 수직 도로 영역
          (Math.abs(z) < 10 && Math.abs(x) < 100) // 수평 도로 영역
        );

        // 랜덤 색상 (회색 계열)
        const r = 0.5 + Math.random() * 0.2;
        const g = 0.5 + Math.random() * 0.2;
        const b = 0.5 + Math.random() * 0.2;
        const color = new THREE.Color(r, g, b);

        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.7,
        });

        const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
        buildingMesh.position.set(x, height / 2 + groundOffset, z);
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;

        // 건물에 약간의 랜덤 회전 추가
        buildingMesh.rotation.y = Math.random() * Math.PI * 2;

        this.scene.add(buildingMesh);
        buildingsCreated++;

        // 게임 상태에 건물 추가
        this.gameState.buildings.push({
          mesh: buildingMesh,
          position: { x, z },
          height: height,
          width: width,
          depth: depth,
        });
      } catch (error) {
        console.error(`기본 건물 #${i} 생성 중 오류:`, error);
      }
    }

    console.log(`기본 건물 생성 완료: ${buildingsCreated}개 생성됨`);
  }

  // 사용자 위치에서 가장 가까운 도로 위치 찾기
  findNearestRoadPoint() {
    if (this.gameState.roads.length === 0) return null;

    let closestPoint = null;
    let minDistance = Infinity;
    let closestDirection = null;

    // 사용자 위치를 Three.js 좌표로 변환
    const userX = 0; // 원점 (변환 후)
    const userZ = 0;

    this.gameState.roads.forEach((road) => {
      // 도로의 각 세그먼트에서 가장 가까운 점 찾기
      const start = road.start;
      const end = road.end;

      // 선분 위 가장 가까운 점 계산 (프로젝션)
      const roadVector = new THREE.Vector3().subVectors(end, start);
      const roadLength = roadVector.length();
      roadVector.normalize();

      const userToStartVector = new THREE.Vector3(
        userX - start.x,
        0,
        userZ - start.z
      );
      const projection = userToStartVector.dot(roadVector);

      let closestPointOnRoad;
      if (projection <= 0) {
        closestPointOnRoad = start.clone();
      } else if (projection >= roadLength) {
        closestPointOnRoad = end.clone();
      } else {
        closestPointOnRoad = start
          .clone()
          .add(roadVector.multiplyScalar(projection));
      }

      const distance = Math.sqrt(
        Math.pow(userX - closestPointOnRoad.x, 2) +
          Math.pow(userZ - closestPointOnRoad.z, 2)
      );

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

  // 차량 시작 위치 설정
  setVehicleStartPosition() {
    // 가장 가까운 도로 위치 찾기
    const nearestRoad = this.findNearestRoadPoint();

    if (nearestRoad && nearestRoad.point) {
      // 약간 도로 위로 올림 (지면과의 충돌 방지)
      this.gameState.car.position.x = nearestRoad.point.x;
      this.gameState.car.position.y = 2; // 지면 위로 올림
      this.gameState.car.position.z = nearestRoad.point.z;

      // 도로 방향에 맞게 자동차 회전 방향 설정
      if (nearestRoad.direction) {
        this.gameState.car.rotation = Math.atan2(
          nearestRoad.direction.x,
          nearestRoad.direction.z
        );
      }

      console.log(
        `차량 시작 위치 설정: (${nearestRoad.point.x.toFixed(
          2
        )}, ${nearestRoad.point.z.toFixed(
          2
        )}), 회전: ${this.gameState.car.rotation.toFixed(2)}`
      );
    } else {
      console.warn("가까운 도로를 찾을 수 없어 차량 위치를 기본값으로 설정");

      // 도로가 생성되었지만 가까운 도로를 찾지 못한 경우
      if (this.gameState.roads.length > 0) {
        const firstRoad = this.gameState.roads[0];
        this.gameState.car.position.x = firstRoad.start.x;
        this.gameState.car.position.y = 2;
        this.gameState.car.position.z = firstRoad.start.z;

        // 도로 방향에 맞게 자동차 회전 방향 설정
        if (firstRoad.direction) {
          this.gameState.car.rotation = Math.atan2(
            firstRoad.direction.x,
            firstRoad.direction.z
          );
        }

        console.log(
          `첫 번째 도로에 차량 배치: (${firstRoad.start.x.toFixed(
            2
          )}, ${firstRoad.start.z.toFixed(2)})`
        );
      }
    }
  }
}
