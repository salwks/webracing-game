import * as THREE from "three";
import mapboxgl from "mapbox-gl";

export class MapLoader {
  constructor(scene, gameState, mapboxApiKey) {
    this.scene = scene;
    this.gameState = gameState;
    this.mapboxApiKey = mapboxApiKey;
    mapboxgl.accessToken = this.mapboxApiKey;

    console.log("MapLoader 클래스 생성됨");
  }

  async loadMapData() {
    try {
      console.log("맵 데이터 로드 시작...");

      // 도로 데이터 가져오기 - Directions API 사용
      try {
        // 현재 위치에서 약간 떨어진 지점까지의 경로를 요청하여 더 넓은 도로 네트워크 가져오기
        const offset = 0.01; // 약 1km 정도의 거리
        const directionsResponse = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${
            this.gameState.userLocation.longitude
          },${this.gameState.userLocation.latitude};${
            this.gameState.userLocation.longitude + offset
          },${
            this.gameState.userLocation.latitude
          }?geometries=geojson&overview=full&access_token=${this.mapboxApiKey}`
        );

        if (!directionsResponse.ok) {
          throw new Error(
            `Directions API 응답 오류: ${directionsResponse.status}`
          );
        }

        const directionsData = await directionsResponse.json();
        if (directionsData.routes && directionsData.routes.length > 0) {
          const route = directionsData.routes[0];
          console.log(
            "경로 데이터 로드 완료:",
            route.geometry.coordinates.length,
            "개 좌표"
          );
          this.createRoadsFromRoute(route.geometry.coordinates);
        } else {
          throw new Error("경로 데이터가 없습니다.");
        }
      } catch (directionsError) {
        console.error("Directions API 요청 실패:", directionsError);

        // Directions API 실패 시 기존 방식으로 시도
        try {
          const roadsResponse = await fetch(
            `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${this.gameState.userLocation.longitude},${this.gameState.userLocation.latitude}.json?layers=road&radius=1000&limit=50&access_token=${this.mapboxApiKey}`
          );

          if (!roadsResponse.ok) {
            throw new Error(`API 응답 오류: ${roadsResponse.status}`);
          }

          const roadsData = await roadsResponse.json();
          console.log(
            "도로 데이터 로드 완료:",
            roadsData.features?.length || 0,
            "개 항목"
          );

          // 도로 생성
          this.createRoads(roadsData.features);
        } catch (tileQueryError) {
          console.error("Tilequery API 요청 실패:", tileQueryError);
          this.createDefaultRoads();
        }
      }

      // 건물 데이터 가져오기
      try {
        const buildingsResponse = await fetch(
          `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${this.gameState.userLocation.longitude},${this.gameState.userLocation.latitude}.json?layers=building&radius=1000&limit=50&access_token=${this.mapboxApiKey}`
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

  // Directions API로 가져온 경로 좌표로 도로 생성
  createRoadsFromRoute(coordinates) {
    console.log("경로 데이터로 도로 생성 시작...");

    if (!coordinates || coordinates.length < 2) {
      console.log("경로 데이터 없음, 기본 도로 생성");
      this.createDefaultRoads();
      return;
    }

    let roadsCreated = 0;
    const roadWidth = 8; // 기본 도로 너비
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333, // 도로 색상 (회색)
      roughness: 0.6,
    });

    // 도로 중심선 표시 (디버깅용)
    const points = [];
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      // 지리 좌표를 Three.js 좌표로 변환
      const x = (coord[0] - this.gameState.userLocation.longitude) * 100000;
      const z = (coord[1] - this.gameState.userLocation.latitude) * 100000;
      points.push(new THREE.Vector3(x, 0.1, z));
    }

    // 각 세그먼트에 대해 도로 생성
    for (let i = 0; i < coordinates.length - 1; i++) {
      const startCoord = coordinates[i];
      const endCoord = coordinates[i + 1];

      // 지리 좌표를 Three.js 좌표로 변환
      const startX =
        (startCoord[0] - this.gameState.userLocation.longitude) * 100000;
      const startZ =
        (startCoord[1] - this.gameState.userLocation.latitude) * 100000;
      const endX =
        (endCoord[0] - this.gameState.userLocation.longitude) * 100000;
      const endZ =
        (endCoord[1] - this.gameState.userLocation.latitude) * 100000;

      const start = new THREE.Vector3(startX, 0.1, startZ);
      const end = new THREE.Vector3(endX, 0.1, endZ);

      // 두 점 사이의 거리와 방향 계산
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();

      if (length <= 0.1) {
        continue; // 너무 짧은 세그먼트는 건너뜀
      }

      direction.normalize();

      // 도로 세그먼트 생성
      const roadGeometry = new THREE.PlaneGeometry(length, roadWidth);
      const road = new THREE.Mesh(roadGeometry, roadMaterial);

      // 회전 및 위치 설정
      road.position.copy(start).add(direction.multiplyScalar(length / 2));
      road.position.y = 0.01; // 바닥 위에 약간 띄움

      // 도로 방향 정렬
      road.lookAt(new THREE.Vector3(end.x, 0.01, end.z));
      road.rotateX(-Math.PI / 2); // 바닥에 평행하게

      road.receiveShadow = true;
      this.scene.add(road);
      roadsCreated++;

      // 도로 표시 - 중앙선 (노란색)
      const centerLineGeometry = new THREE.PlaneGeometry(length, 0.3);
      const centerLineMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide,
      });
      const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
      centerLine.position.copy(road.position);
      centerLine.position.y = 0.02; // 도로 위에 살짝 띄움
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

  // 기존 createRoads 메소드
  createRoads(roadFeatures) {
    console.log("도로 생성 시작...");

    if (!roadFeatures || roadFeatures.length === 0) {
      console.log("도로 데이터 없음, 기본 도로 생성");
      this.createDefaultRoads();
      return;
    }

    let roadsCreated = 0;

    roadFeatures.forEach((road, index) => {
      if (!road.geometry || !road.geometry.coordinates) {
        console.warn(`도로 #${index}: 좌표 데이터 없음`);
        return;
      }

      const coordinates = road.geometry.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        console.warn(`도로 #${index}: 유효하지 않은 좌표 데이터`);
        return;
      }

      try {
        // 지리 좌표를 Three.js 좌표로 변환
        const roadPoints = [];
        let hasNaN = false;

        coordinates.forEach((coord, i) => {
          if (!Array.isArray(coord) || coord.length < 2) {
            console.warn(`도로 #${index}: 좌표 #${i} 형식 오류`);
            hasNaN = true;
            return;
          }

          // 현재 위치를 중심으로 상대적 거리 계산 (단순화된 계산법)
          const x = (coord[0] - this.gameState.userLocation.longitude) * 100000;
          const z = (coord[1] - this.gameState.userLocation.latitude) * 100000;

          if (isNaN(x) || isNaN(z)) {
            console.warn(`도로 #${index}: 좌표 #${i} NaN 값 포함 [${x}, ${z}]`);
            hasNaN = true;
            return;
          }

          roadPoints.push(new THREE.Vector3(x, 0.1, z));
        });

        if (hasNaN || roadPoints.length < 2) {
          console.warn(`도로 #${index}: 잘못된 좌표로 건너뜀`);
          return;
        }

        // 도로 너비 (도로 유형에 따라 다르게 설정)
        let roadWidth = 5;
        if (road.properties && road.properties.class) {
          switch (road.properties.class) {
            case "motorway":
            case "trunk":
              roadWidth = 10;
              break;
            case "primary":
              roadWidth = 8;
              break;
            case "secondary":
              roadWidth = 6;
              break;
            default:
              roadWidth = 4;
          }
        }

        // 도로 생성 (직선 세그먼트)
        for (let i = 0; i < roadPoints.length - 1; i++) {
          const start = roadPoints[i];
          const end = roadPoints[i + 1];

          // 두 점 사이의 거리와 방향 계산
          const direction = new THREE.Vector3().subVectors(end, start);
          const length = direction.length();

          if (length <= 0.1) {
            console.warn(
              `도로 #${index} 세그먼트 #${i}: 길이가 너무 작음 (${length})`
            );
            continue;
          }

          direction.normalize();

          // 도로 세그먼트 생성
          const roadGeometry = new THREE.PlaneGeometry(length, roadWidth);
          const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333, // 도로 색상 (회색)
            roughness: 0.6,
          });

          const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);

          // 회전 및 위치 설정
          roadMesh.position
            .copy(start)
            .add(direction.multiplyScalar(length / 2));
          roadMesh.position.y = 0.01; // 바닥 위에 약간 띄움

          // 도로 방향 정렬
          roadMesh.lookAt(new THREE.Vector3(end.x, 0.01, end.z));
          roadMesh.rotateX(-Math.PI / 2); // 바닥에 평행하게

          roadMesh.receiveShadow = true;
          this.scene.add(roadMesh);
          roadsCreated++;

          // 도로 마킹 추가 (중앙선)
          if (roadWidth >= 6) {
            const centerLineGeometry = new THREE.PlaneGeometry(length, 0.3);
            const centerLineMaterial = new THREE.MeshBasicMaterial({
              color: 0xffff00,
              side: THREE.DoubleSide,
            });
            const centerLine = new THREE.Mesh(
              centerLineGeometry,
              centerLineMaterial
            );
            centerLine.position.copy(roadMesh.position);
            centerLine.position.y = 0.02; // 도로 위에 살짝 띄움
            centerLine.rotation.copy(roadMesh.rotation);
            this.scene.add(centerLine);
          }

          // 게임 상태에 도로 추가
          this.gameState.roads.push({
            mesh: roadMesh,
            start: start,
            end: end,
            width: roadWidth,
            direction: direction.clone(),
          });
        }
      } catch (error) {
        console.error(`도로 #${index} 생성 중 오류:`, error);
      }
    });

    console.log(`도로 생성 완료: ${roadsCreated}개 생성됨`);
  }

  createDefaultRoads() {
    console.log("기본 도로 생성 중...");

    // 십자형 도로 생성
    const roadWidth = 8;

    // 수평 도로
    const horizontalRoadGeometry = new THREE.PlaneGeometry(200, roadWidth);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.6,
    });

    const horizontalRoad = new THREE.Mesh(horizontalRoadGeometry, roadMaterial);
    horizontalRoad.rotation.x = -Math.PI / 2;
    horizontalRoad.position.y = 0.01;
    horizontalRoad.receiveShadow = true;
    this.scene.add(horizontalRoad);

    // 수평 도로 중앙선
    const horizontalCenterLineGeometry = new THREE.PlaneGeometry(200, 0.3);
    const centerLineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      side: THREE.DoubleSide,
    });
    const horizontalCenterLine = new THREE.Mesh(
      horizontalCenterLineGeometry,
      centerLineMaterial
    );
    horizontalCenterLine.rotation.x = -Math.PI / 2;
    horizontalCenterLine.position.y = 0.02;
    this.scene.add(horizontalCenterLine);

    // 수직 도로
    const verticalRoadGeometry = new THREE.PlaneGeometry(roadWidth, 200);
    const verticalRoad = new THREE.Mesh(verticalRoadGeometry, roadMaterial);
    verticalRoad.rotation.x = -Math.PI / 2;
    verticalRoad.position.y = 0.01;
    verticalRoad.receiveShadow = true;
    this.scene.add(verticalRoad);

    // 수직 도로 중앙선
    const verticalCenterLineGeometry = new THREE.PlaneGeometry(0.3, 200);
    const verticalCenterLine = new THREE.Mesh(
      verticalCenterLineGeometry,
      centerLineMaterial
    );
    verticalCenterLine.rotation.x = -Math.PI / 2;
    verticalCenterLine.position.y = 0.02;
    this.scene.add(verticalCenterLine);

    // 게임 상태에 도로 추가
    const horizontalDirection = new THREE.Vector3(1, 0, 0);
    const verticalDirection = new THREE.Vector3(0, 0, 1);

    this.gameState.roads.push({
      mesh: horizontalRoad,
      start: new THREE.Vector3(-100, 0, 0),
      end: new THREE.Vector3(100, 0, 0),
      width: roadWidth,
      direction: horizontalDirection,
    });

    this.gameState.roads.push({
      mesh: verticalRoad,
      start: new THREE.Vector3(0, 0, -100),
      end: new THREE.Vector3(0, 0, 100),
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
        const height =
          building.properties && building.properties.height
            ? building.properties.height
            : Math.random() * 30 + 10;

        // 지리 좌표를 Three.js 좌표로 변환
        const coordinates = building.geometry.coordinates;
        let x, z;

        if (Array.isArray(coordinates) && coordinates.length >= 1) {
          if (Array.isArray(coordinates[0]) && coordinates[0].length >= 2) {
            // 폴리곤 형식 - 첫 번째 좌표 사용
            x =
              (coordinates[0][0] - this.gameState.userLocation.longitude) *
              100000;
            z =
              (coordinates[0][1] - this.gameState.userLocation.latitude) *
              100000;
          } else if (coordinates.length >= 2) {
            // 점 형식
            x =
              (coordinates[0] - this.gameState.userLocation.longitude) * 100000;
            z =
              (coordinates[1] - this.gameState.userLocation.latitude) * 100000;
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
        const color = new THREE.Color(
          0.5 + Math.random() * 0.2,
          0.5 + Math.random() * 0.2,
          0.5 + Math.random() * 0.2
        );

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
        buildingMesh.position.set(x, height / 2, z);
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;
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
        const color = new THREE.Color(
          0.5 + Math.random() * 0.2,
          0.5 + Math.random() * 0.2,
          0.5 + Math.random() * 0.2
        );

        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.7,
        });

        const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
        buildingMesh.position.set(x, height / 2, z);
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;
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
