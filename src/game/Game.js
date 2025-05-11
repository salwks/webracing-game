import * as THREE from "three";
import { Car } from "./Car";
import { MapLoader } from "./MapLoader";
import { Controls } from "./Controls";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
        position: { x: 0, y: 10, z: -20 }, // 초기 카메라 위치 수정
        lookAt: { x: 0, y: 0, z: 0 },
        mode: "follow",
      },
      userLocation: {
        longitude: 0,
        latitude: 0,
      },
      gameTime: 0,
      score: 0,
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
      debug: true, // 디버깅 모드 활성화
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
    this.orbitControls = null; // 디버깅용 OrbitControls

    // 게임 컴포넌트
    this.carComponent = null;
    this.mapLoader = null;
    this.controls = null;

    // 디버깅 요소
    this.axesHelper = null;
    this.debugText = null;

    // 로그 출력
    console.log("게임 인스턴스 생성됨");
  }

  async init() {
    console.log("게임 초기화 시작");

    // Three.js 초기화
    this.initThreeJS();

    // 디버깅 도구 설정
    this.setupDebugTools();

    // 위치 정보 가져오기
    await this.getUserLocation();

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

    // 카메라 초기 위치 설정 - 자동차 뒤에서 시작
    this.state.camera.position = {
      x: this.state.car.position.x - Math.sin(this.state.car.rotation) * 15,
      y: this.state.car.position.y + 7,
      z: this.state.car.position.z - Math.cos(this.state.car.rotation) * 15,
    };
    this.state.camera.lookAt = {
      x: this.state.car.position.x,
      y: this.state.car.position.y + 2,
      z: this.state.car.position.z,
    };

    // 카메라 업데이트 적용
    this.updateCamera();

    // 사운드 초기화
    this.initSounds();

    // 미니맵 생성
    this.minimapCanvas = this.createMinimap();

    // 로딩 화면 숨기기
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
      loadingElement.style.display = "none";
    }

    // 차량 상태 표시
    this.createDebugDisplay();

    // 게임 루프 시작
    console.log("게임 초기화 완료, 애니메이션 루프 시작");
    this.animate();

    return this;
  }

  // 디버깅 도구 설정
  setupDebugTools() {
    if (this.state.debug) {
      // 축 헬퍼 추가
      this.axesHelper = new THREE.AxesHelper(20);
      this.scene.add(this.axesHelper);

      // 그리드 헬퍼 추가
      const gridHelper = new THREE.GridHelper(1000, 100);
      this.scene.add(gridHelper);

      // OrbitControls 추가 (디버깅용, 처음에는 비활성화)
      this.orbitControls = new OrbitControls(
        this.camera,
        this.renderer.domElement
      );
      this.orbitControls.enabled = false; // 필요할 때만 켜기

      // 키보드 단축키 추가 (O 키 - OrbitControls 전환)
      window.addEventListener("keydown", (e) => {
        if (e.key === "o" || e.key === "O") {
          this.orbitControls.enabled = !this.orbitControls.enabled;
          console.log(
            `OrbitControls ${
              this.orbitControls.enabled ? "활성화" : "비활성화"
            }`
          );
        }
      });
    }
  }

  // 디버그 표시 요소 생성
  createDebugDisplay() {
    if (this.state.debug) {
      this.debugText = document.createElement("div");
      this.debugText.id = "debugInfo";
      this.debugText.style.position = "absolute";
      this.debugText.style.top = "10px";
      this.debugText.style.left = "10px";
      this.debugText.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      this.debugText.style.color = "white";
      this.debugText.style.padding = "10px";
      this.debugText.style.fontFamily = "monospace";
      this.debugText.style.fontSize = "14px";
      this.debugText.style.zIndex = "1000";
      this.debugText.style.maxWidth = "400px";
      document.body.appendChild(this.debugText);
    }
  }

  // 디버그 정보 업데이트
  updateDebugInfo() {
    if (this.state.debug && this.debugText) {
      this.debugText.innerHTML = `
        <h3>디버그 정보</h3>
        <p>FPS: ${(1 / this.clock.getDelta()).toFixed(1)}</p>
        <p>카메라 모드: ${this.state.camera.mode}</p>
        <p>차량 위치: (${this.state.car.position.x.toFixed(
          2
        )}, ${this.state.car.position.y.toFixed(
        2
      )}, ${this.state.car.position.z.toFixed(2)})</p>
        <p>차량 속도: ${this.state.car.speed.toFixed(2)} km/h</p>
        <p>카메라 위치: (${this.state.camera.position.x.toFixed(
          2
        )}, ${this.state.camera.position.y.toFixed(
        2
      )}, ${this.state.camera.position.z.toFixed(2)})</p>
        <p>컨트롤: W/S/A/D 또는 방향키 - 이동, Space - 브레이크, C - 카메라 전환, O - OrbitControls 전환</p>
      `;
    }
  }

  // 위치 정보 가져오기
  async getUserLocation() {
    return new Promise((resolve, reject) => {
      console.log("위치 정보 요청 중...");

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.state.userLocation.latitude = position.coords.latitude;
            this.state.userLocation.longitude = position.coords.longitude;
            console.log("위치 정보 가져옴:", this.state.userLocation);
            resolve();
          },
          (error) => {
            console.error("위치 정보를 가져올 수 없습니다:", error);
            // 기본 위치 설정 (서울 시청)
            this.state.userLocation.latitude = 37.5665;
            this.state.userLocation.longitude = 126.978;
            console.log("기본 위치로 설정됨 (서울 시청)");
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
        console.log("기본 위치로 설정됨 (서울 시청)");
        resolve();
      }
    });
  }

  // Three.js 초기화
  initThreeJS() {
    console.log("Three.js 초기화 중...");

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
    this.camera.position.set(0, 10, -20); // 초기 위치 수정
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

    console.log("Three.js 초기화 완료");
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
      console.warn("필수 컴포넌트가 아직 초기화되지 않았습니다.");
      return;
    }

    // 자동차 업데이트
    this.carComponent.update(deltaTime);

    // 카메라 업데이트 - 이 부분이 핵심!
    this.updateCamera();

    // OrbitControls가 활성화되어 있으면 카메라를 직접 업데이트하지 않음
    if (this.state.debug && this.orbitControls && this.orbitControls.enabled) {
      this.orbitControls.update();
    }

    // 게임 로직 업데이트
    this.updateGameLogic(deltaTime);

    // 미니맵 업데이트
    if (this.minimapCanvas) {
      this.updateMinimap(this.minimapCanvas);
    }

    // 디버그 정보 업데이트
    if (this.state.debug) {
      this.updateDebugInfo();
    }

    // 렌더링
    this.renderer.render(this.scene, this.camera);
  }

  // 카메라 업데이트 메소드
  updateCamera() {
    // OrbitControls가 활성화되어 있으면 카메라를 직접 업데이트하지 않음
    if (this.state.debug && this.orbitControls && this.orbitControls.enabled) {
      return;
    }

    // state.camera의 position과 lookAt 정보를 가져와 실제 카메라에 적용
    if (this.camera && this.state.camera.position && this.state.camera.lookAt) {
      this.camera.position.set(
        this.state.camera.position.x,
        this.state.camera.position.y,
        this.state.camera.position.z
      );

      this.camera.lookAt(
        this.state.camera.lookAt.x,
        this.state.camera.lookAt.y,
        this.state.camera.lookAt.z
      );
    }
  }

  // 게임 로직 업데이트
  updateGameLogic(deltaTime) {
    // 여기에 게임 로직 구현
    // 각종 게임 시스템 업데이트 (점수, 시간 등)

    // 예: 시간 경과에 따른 점수 증가
    this.state.score += deltaTime * Math.abs(this.state.car.speed) * 0.1;
  }

  // 미니맵 생성
  createMinimap() {
    const minimapContainer = document.createElement("div");
    minimapContainer.id = "minimap";
    minimapContainer.style.position = "absolute";
    minimapContainer.style.top = "20px";
    minimapContainer.style.right = "20px";
    minimapContainer.style.width = "200px";
    minimapContainer.style.height = "200px";
    minimapContainer.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    minimapContainer.style.borderRadius = "5px";

    const minimapCanvas = document.createElement("canvas");
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;

    minimapContainer.appendChild(minimapCanvas);
    document.body.appendChild(minimapContainer);

    return minimapCanvas;
  }

  // 미니맵 업데이트
  updateMinimap(canvas) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // 미니맵 초기화
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, width, height);

    // 도로 그리기
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;

    this.state.roads.forEach((road) => {
      // 좌표 변환 (게임 좌표계 -> 미니맵 좌표계)
      const startX = ((road.start.x / 100) * width) / 2 + width / 2;
      const startZ = ((road.start.z / 100) * height) / 2 + height / 2;
      const endX = ((road.end.x / 100) * width) / 2 + width / 2;
      const endZ = ((road.end.z / 100) * height) / 2 + height / 2;

      ctx.beginPath();
      ctx.moveTo(startX, startZ);
      ctx.lineTo(endX, endZ);
      ctx.stroke();
    });

    // 건물 그리기
    ctx.fillStyle = "#aaa";
    this.state.buildings.forEach((building) => {
      const x = ((building.position.x / 100) * width) / 2 + width / 2;
      const z = ((building.position.z / 100) * height) / 2 + height / 2;
      const size = (building.width / 100) * width;

      ctx.fillRect(x - size / 2, z - size / 2, size, size);
    });

    // 자동차 그리기
    ctx.fillStyle = "#f00";
    const carX = ((this.state.car.position.x / 100) * width) / 2 + width / 2;
    const carZ = ((this.state.car.position.z / 100) * height) / 2 + height / 2;

    // 자동차 위치와 방향 표시
    ctx.save();
    ctx.translate(carX, carZ);
    ctx.rotate(-this.state.car.rotation + Math.PI / 2);

    // 삼각형으로 자동차 표시
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-3, 5);
    ctx.lineTo(3, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 사운드 초기화
  initSounds() {
    // 사운드 초기화 코드
    // 나중에 필요한 사운드들을 여기에 추가
    console.log("사운드 시스템 초기화");

    // 예제: 엔진 사운드 (실제로는 Audio 객체 생성 및 로드 필요)
    /*
    this.state.sounds.engine = new Audio('sounds/engine.mp3');
    this.state.sounds.engine.loop = true;
    this.state.sounds.collision = new Audio('sounds/collision.mp3');
    this.state.sounds.horn = new Audio('sounds/horn.mp3');
    */
  }
}
