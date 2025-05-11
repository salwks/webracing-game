import * as THREE from "three";
import mapboxgl from "mapbox-gl";

export class MapLoader {
  constructor(scene, gameState, mapboxApiKey) {
    this.scene = scene;
    this.gameState = gameState;
    this.mapboxApiKey = mapboxApiKey;
    mapboxgl.accessToken = this.mapboxApiKey;
  }

  async loadMapData() {
    try {
      // 도로 데이터 가져오기
      const roadsResponse = await fetch(
        `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${this.gameState.userLocation.longitude},${this.gameState.userLocation.latitude}.json?layers=road&radius=1000&limit=50&access_token=${this.mapboxApiKey}`
      );
      const roadsData = await roadsResponse.json();

      // 도로 생성
      this.createRoads(roadsData.features);

      // 건물 데이터 가져오기
      const buildingsResponse = await fetch(
        `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${this.gameState.userLocation.longitude},${this.gameState.userLocation.latitude}.json?layers=building&radius=1000&limit=50&access_token=${this.mapboxApiKey}`
      );
      const buildingsData = await buildingsResponse.json();

      // 건물 생성
      this.createBuildings(buildingsData.features);

      console.log("맵 데이터 로드 완료");
    } catch (error) {
      console.error("맵 데이터를 가져오는 중 오류 발생:", error);
      // 오류 시 기본 도로 생성
      this.createDefaultRoads();
    }
  }

  createRoads(roadFeatures) {
    if (!roadFeatures || roadFeatures.length === 0) {
      this.createDefaultRoads();
      return;
    }

    roadFeatures.forEach((road) => {
      if (!road.geometry || !road.geometry.coordinates) return;

      const coordinates = road.geometry.coordinates;

      // 지리 좌표를 Three.js 좌표로 변환
      const roadPoints = [];
      coordinates.forEach((coord) => {
        // 현재 위치를 중심으로 상대적 거리 계산 (단순화된 계산법)
        const x = (coord[0] - this.gameState.userLocation.longitude) * 100000;
        const z = (coord[1] - this.gameState.userLocation.latitude) * 100000;
        roadPoints.push(new THREE.Vector3(x, 0.1, z));
      });

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
        road.lookAt(end.clone().setY(0.01));
        road.rotateX(-Math.PI / 2); // 바닥에 평행하게

        road.receiveShadow = true;
        this.scene.add(road);

        // 게임 상태에 도로 추가
        this.gameState.roads.push({
          mesh: road,
          start: start,
          end: end,
          width: roadWidth,
        });
      }
    });

    // 스타트 지점 설정 (첫 번째 도로 위치)
    if (this.gameState.roads.length > 0) {
      const firstRoad = this.gameState.roads[0];
      this.gameState.car.position.x = firstRoad.start.x;
      this.gameState.car.position.z = firstRoad.start.z;
    }
  }

  createDefaultRoads() {
    console.log("기본 도로 생성");

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
  }

  createBuildings(buildingFeatures) {
    if (!buildingFeatures || buildingFeatures.length === 0) {
      this.createDefaultBuildings();
      return;
    }

    buildingFeatures.forEach((building) => {
      if (!building.geometry || !building.geometry.coordinates) return;

      // 건물 높이 (임의 또는 데이터에서 가져옴)
      const height =
        building.properties && building.properties.height
          ? building.properties.height
          : Math.random() * 30 + 10;

      // 지리 좌표를 Three.js 좌표로 변환
      const x =
        (building.geometry.coordinates[0] -
          this.gameState.userLocation.longitude) *
        100000;
      const z =
        (building.geometry.coordinates[1] -
          this.gameState.userLocation.latitude) *
        100000;

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

      // 게임 상태에 건물 추가
      this.gameState.buildings.push({
        mesh: buildingMesh,
        position: { x, z },
        height: height,
        width: 10,
        depth: 10,
      });
    });
  }

  createDefaultBuildings() {
    // 도로 주변에 무작위 건물 생성
    for (let i = 0; i < 50; i++) {
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

      // 게임 상태에 건물 추가
      this.gameState.buildings.push({
        mesh: buildingMesh,
        position: { x, z },
        height: height,
        width: 10,
        depth: 10,
      });
    }
  }
}
