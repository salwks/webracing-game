import * as THREE from "three";
import { Car } from "./Car";
import { MapLoader } from "./MapLoader";
import { Controls } from "./Controls";

export class Game {
  constructor() {
    // Mapbox API 키
    this.MAPBOX_API_KEY =
      "pk.eyJ1Ijoic2Fsd2tzIiwiYSI6ImNtYWdtNDV2MzAyamQyanB1aDEwaHpjcXgifQ.K7zKD6fL_WSFjHWyj6mpAA";

    // 게임 상태
    this.state = {
      car: {
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        speed: 0,
        acceleration: 0,
        maxSpeed: 150,
        health: 100,
        fuel: 100,
      },
      roads: [],
      buildings: [],
      traffic: [],
      camera: {
        position: { x: 0, y: 5, z: -10 },
        lookAt: { x: 0, y: 0, z: 0 },
        mode: "follow",
      },
      userLocation: {
        longitude: 0,
        latitude: 0,
      },
      gameTime: 0,
      score: 0,
      // 여기서 controls 객체가 명시적으로 초기화되어야 함
      controls: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        horn: false,
        camera: false,
      },
      sounds: {
        engine: null,
        collision: null,
        horn: null,
      },
      paused: false,
    };

    // Three.js 관련 객체
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.car = null;
    this.dirLight = null;
    this.headlight1 = null;
    this.headlight2 = null;
    this.minimapCanvas = null;
    this.clock = new THREE.Clock();

    // 게임 컴포넌트
    this.carComponent = null;
    this.mapLoader = null;
    this.controls = null;
  }

  async init() {
    // 위치 정보 가져오기
    await this.getUserLocation();

    // Three.js 초기화
    this.initThreeJS();

    // 컴포넌트 초기화 순서 변경
    // Controls를 먼저 초기화
    this.controls = new Controls(this.state);
    this.controls.setupEventListeners();

    // 그 다음 다른 컴포넌트 초기화
    this.mapLoader = new MapLoader(this.scene, this.state, this.MAPBOX_API_KEY);
    this.carComponent = new Car(this.scene, this.state);

    // 지도 데이터 로드
    await this.mapLoader.loadMapData();

    // 자동차 모델 로드
    await this.carComponent.loadModel();
    this.car = this.carComponent.car;

    // 사운드 초기화
    this.initSounds();

    // 미니맵 생성
    this.minimapCanvas = this.createMinimap();

    // 로딩 화면 숨기기
    document.getElementById("loading").style.display = "none";

    // 게임 루프 시작
    this.animate();

    return this;
  }

  // 나머지 메소드들...
  // getUserLocation(), initThreeJS(), initSounds(), createMinimap(), animate() 등

  // 위치 정보 가져오기
  async getUserLocation() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.state.userLocation.latitude = position.coords.latitude;
            this.state.userLocation.longitude = position.coords.longitude;
            console.log("위치 정보:", this.state.userLocation);
            resolve();
          },
          (error) => {
            console.error("위치 정보를 가져올 수 없습니다:", error);
            // 기본 위치 설정 (서울 시청)
            this.state.userLocation.latitude = 37.5665;
            this.state.userLocation.longitude = 126.978;
            resolve();
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      } else {
        console.error("브라우저가 위치 정보를 지원하지 않습니다.");
        // 기본 위치 설정 (서울 시청)
        this.state.userLocation.latitude = 37.5665;
        this.state.userLocation.longitude = 126.978;
        resolve();
      }
    });
  }

  // Three.js 초기화
  initThreeJS() {
    // 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // 하늘색 배경

    // 카메라 설정
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, -10);
    this.camera.lookAt(0, 0, 0);

    // 렌더러 설정
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // 조명 설정
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1);
    this.dirLight.position.set(100, 100, 50);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 200;
    this.dirLight.shadow.camera.left = -50;
    this.dirLight.shadow.camera.right = 50;
    this.dirLight.shadow.camera.top = 50;
    this.dirLight.shadow.camera.bottom = -50;
    this.scene.add(this.dirLight);

    // 지면 생성
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a5e1a,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 창 크기 조정 이벤트
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // 애니메이션 루프
  animate() {
    requestAnimationFrame(this.animate.bind(this));

    if (this.state.paused) return;

    const deltaTime = this.clock.getDelta();

    // 게임 시간 업데이트
    this.state.gameTime += deltaTime;

    // 안전장치: 필요한 컴포넌트들이 초기화되었는지 확인
    if (!this.carComponent || !this.state.controls) {
      console.warn("Essential components are not initialized yet.");
      return;
    }

    // 자동차 업데이트
    this.carComponent.update(deltaTime);

    // 게임 로직 업데이트
    this.updateGameLogic(deltaTime);

    // 미니맵 업데이트
    if (this.minimapCanvas) {
      this.updateMinimap(this.minimapCanvas);
    }

    // 렌더링
    this.renderer.render(this.scene, this.camera);
  }

  // 게임 로직 업데이트
  updateGameLogic(deltaTime) {
    // 여기에 게임 로직 구현
  }

  // 미니맵 생성
  createMinimap() {
    // 미니맵 생성 코드
    return null; // 임시로 null 반환
  }

  // 미니맵 업데이트
  updateMinimap(canvas) {
    // 미니맵 업데이트 코드
  }

  // 사운드 초기화
  initSounds() {
    // 사운드 초기화 코드
  }
}
