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

      // 도로 데이터 가져오기
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
      } catch (error) {
        console.error("도로 데이터 가져오기 실패:", error);
        this.createDefaultRoads();
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

      console.log("맵 데이터 로드 완료");
    } catch (error) {
      console.error("맵 데이터를 가져오는 중 오류 발생:", error);
      // 오류 시 기본 맵 생성
      this.createDefaultRoads();
      this.createDefaultBuildings();
    }
  }

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
              roadWidth = 8;
              break;
            case "primary":
              roadWidth = 6;
              break;
            case "secondary":
              roadWidth = 5;
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

          // 게임 상태에 도로 추가
          this.gameState.roads.push({
            mesh: road,
            start: start,
            end: end,
            width: roadWidth,
          });
        }
      } catch (error) {
        console.error(`도로 #${index} 생성 중 오류:`, error);
      }
    });

    console.log(`도로 생성 완료: ${roadsCreated}개 생성됨`);

    // 스타트 지점 설정 (첫 번째 도로 위치)
    if (this.gameState.roads.length > 0) {
      const firstRoad = this.gameState.roads[0];
      this.gameState.car.position.x = firstRoad.start.x;
      this.gameState.car.position.z = firstRoad.start.z;
      console.log(
        `차량 시작 위치 설정: (${firstRoad.start.x}, ${firstRoad.start.z})`
      );
    } else {
      console.warn("도로가 생성되지 않아 차량 위치를 기본값으로 설정");
    }
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

    // 수직 도로
    const verticalRoadGeometry = new THREE.PlaneGeometry(roadWidth, 200);
    const verticalRoad = new THREE.Mesh(verticalRoadGeometry, roadMaterial);
    verticalRoad.rotation.x = -Math.PI / 2;
    verticalRoad.position.y = 0.01;
    verticalRoad.receiveShadow = true;
    this.scene.add(verticalRoad);

    // 게임 상태에 도로 추가
    this.gameState.roads.push({
      mesh: horizontalRoad,
      start: new THREE.Vector3(-100, 0, 0),
      end: new THREE.Vector3(100, 0, 0),
      width: roadWidth,
    });

    this.gameState.roads.push({
      mesh: verticalRoad,
      start: new THREE.Vector3(0, 0, -100),
      end: new THREE.Vector3(0, 0, 100),
      width: roadWidth,
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

        // 간단한 박스로 건물 표현
        const buildingGeometry = new THREE.BoxGeometry(10, height, 10);
        const buildingMaterial = new THREE.MeshStandardMaterial({
          color: 0xaaaaaa,
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
          width: 10,
          depth: 10,
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

        const buildingGeometry = new THREE.BoxGeometry(10, height, 10);
        const color = Math.random() > 0.5 ? 0xaaaaaa : 0xcccccc;
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
          width: 10,
          depth: 10,
        });
      } catch (error) {
        console.error(`기본 건물 #${i} 생성 중 오류:`, error);
      }
    }

    console.log(`기본 건물 생성 완료: ${buildingsCreated}개 생성됨`);
  }
}
