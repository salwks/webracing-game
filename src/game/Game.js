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
    this.ground = null; // 지도 바닥면 참조
    this.clock = new THREE.Clock();
    this.orbitControls = null; // 디버깅용 OrbitControls

    // 게임 컴포넌트
    this.carComponent = null;
    this.mapLoader = null;
    this.controls = null;

    // 디버깅 요소
    this.axesHelper = null;
    this.debugText = null;

    // 로딩 표시
    this.loadingElement = null;
    this.loadingProgress = 0;
    this.totalLoadingSteps = 4; // 위치 정보, 맵 데이터, 차량 모델, 지도 텍스처

    // 로그 출력
    console.log("게임 인스턴스 생성됨");
  }

  async init() {
    console.log("게임 초기화 시작");

    // 로딩 화면 표시
    this.initLoadingScreen();

    // Three.js 초기화
    this.initThreeJS();

    // 디버깅 도구 설정
    this.setupDebugTools();

    // 위치 정보 가져오기
    this.updateLoadingProgress("위치 정보 가져오는 중...");
    await this.getUserLocation();

    // 맵 텍스처 생성
    this.updateLoadingProgress("지도 텍스처 로드 중...");
    await this.createMapGround();

    // Controls를 먼저 초기화
    this.controls = new Controls(this.state);
    this.controls.setupEventListeners();

    // controls 객체를 window에 노출하여 다른 컴포넌트에서 접근 가능하게 함
    window.game = this;

    // 그 다음 다른 컴포넌트 초기화
    this.mapLoader = new MapLoader(this.scene, this.state, this.MAPBOX_API_KEY);
    this.carComponent = new Car(this.scene, this.state);

    // 지도 데이터 로드
    this.updateLoadingProgress("지도 데이터 로드 중...");
    await this.mapLoader.loadMapData();

    // 자동차 모델 로드
    this.updateLoadingProgress("차량 모델 로드 중...");
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

    // 차량 상태 표시 UI 생성
    this.createGameUI();

    // 로딩 화면 숨기기
    this.updateLoadingProgress("게임 시작...", 100);
    setTimeout(() => {
      const loadingElement = document.getElementById("loading");
      if (loadingElement) {
        loadingElement.style.display = "none";
      }

      // 게임 시작 알림
      const startMessage = document.createElement("div");
      startMessage.id = "startMessage";
      startMessage.style.position = "absolute";
      startMessage.style.top = "50%";
      startMessage.style.left = "50%";
      startMessage.style.transform = "translate(-50%, -50%)";
      startMessage.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      startMessage.style.color = "white";
      startMessage.style.padding = "20px";
      startMessage.style.borderRadius = "10px";
      startMessage.style.fontSize = "24px";
      startMessage.style.fontWeight = "bold";
      startMessage.style.zIndex = "1000";
      startMessage.style.textAlign = "center";
      startMessage.innerHTML =
        "게임 시작!<br>W/A/S/D 또는 방향키로 움직이세요<br>스페이스바로 브레이크<br>C 키로 카메라 전환";
      document.body.appendChild(startMessage);

      setTimeout(() => {
        startMessage.style.opacity = "0";
        startMessage.style.transition = "opacity 1s";
        setTimeout(() => {
          document.body.removeChild(startMessage);
        }, 1000);
      }, 3000);
    }, 500);

    // 게임 루프 시작
    console.log("게임 초기화 완료, 애니메이션 루프 시작");
    this.animate();

    return this;
  }

  // Three.js 초기화
  initThreeJS() {
    console.log("Three.js 초기화 중...");

    // 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // 하늘색 배경

    // 안개 추가
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);

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
    this.renderer.setPixelRatio(window.devicePixelRatio);
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

    // 맵 텍스쳐 적용은 createMapGround 메소드에서 별도로 처리

    // 창 크기 조정 이벤트
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    console.log("Three.js 초기화 완료");
  }

  // 지도 텍스처를 사용한 바닥면 생성
  async createMapGround() {
    console.log("지도 텍스처 바닥면 생성 중...");

    // 바닥면 크기
    const groundSize = 2000;

    // 지도 영역 계산
    const lat = this.state.userLocation.latitude;
    const lng = this.state.userLocation.longitude;

    // 지도 확대 수준 (값이 클수록 더 확대됨)
    const zoom = 16;

    // 지도 스타일
    const mapStyle = "mapbox/satellite-streets-v12"; // 위성 이미지와 도로 정보가 결합된 스타일

    // 지도 이미지 크기
    const mapWidth = 1024;
    const mapHeight = 1024;

    // Mapbox Static Maps API URL
    const mapUrl = `https://api.mapbox.com/styles/v1/${mapStyle}/static/${lng},${lat},${zoom}/${mapWidth}x${mapHeight}?access_token=${this.MAPBOX_API_KEY}`;

    try {
      // 텍스처 로더
      const textureLoader = new THREE.TextureLoader();

      // 지도 텍스처 로드
      const mapTexture = await new Promise((resolve, reject) => {
        textureLoader.load(
          mapUrl,
          (texture) => resolve(texture),
          undefined,
          (error) => reject(error)
        );
      });

      // 로드된 텍스처로 바닥면 생성
      const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
      const groundMaterial = new THREE.MeshStandardMaterial({
        map: mapTexture,
        roughness: 0.8,
      });

      this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
      this.ground.rotation.x = -Math.PI / 2; // 수평으로 배치
      this.ground.position.y = 0; // 바닥 높이
      this.ground.receiveShadow = true;

      // 씬에 추가
      this.scene.add(this.ground);

      console.log("지도 텍스처 바닥면 생성 완료");
      return this.ground;
    } catch (error) {
      console.error("지도 텍스처 로드 실패:", error);

      // 실패 시 대체 바닥면 생성
      return this.createFallbackGround(groundSize);
    }
  }

  // 지도 로드 실패 시 대체 바닥면 생성
  createFallbackGround(groundSize) {
    console.log("대체 바닥면 생성 중...");

    // 그라데이션 텍스처 생성 (초록색)
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "#34a853"); // 내부: 밝은 초록색
    gradient.addColorStop(1, "#1a5e1a"); // 외부: 어두운 초록색
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);

    const groundTexture = new THREE.CanvasTexture(canvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(groundSize / 100, groundSize / 100);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.8,
    });

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      groundMaterial
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    console.log("대체 바닥면 생성 완료");
    return this.ground;
  }

  // 로딩 화면 초기화
  initLoadingScreen() {
    this.loadingElement = document.getElementById("loading");
    if (this.loadingElement) {
      // 프로그레스 바 추가
      const progressBar = document.createElement("div");
      progressBar.id = "progressBar";
      progressBar.style.width = "300px";
      progressBar.style.height = "10px";
      progressBar.style.backgroundColor = "#333";
      progressBar.style.marginTop = "20px";
      progressBar.style.borderRadius = "5px";
      progressBar.style.overflow = "hidden";

      const progress = document.createElement("div");
      progress.id = "progress";
      progress.style.width = "0%";
      progress.style.height = "100%";
      progress.style.backgroundColor = "#4CAF50";
      progress.style.transition = "width 0.3s";

      progressBar.appendChild(progress);
      this.loadingElement.appendChild(progressBar);

      // 상태 텍스트 추가
      const statusText = document.createElement("div");
      statusText.id = "loadingStatus";
      statusText.style.marginTop = "10px";
      statusText.style.fontSize = "14px";
      statusText.textContent = "초기화 중...";
      this.loadingElement.appendChild(statusText);
    }
  }

  // 로딩 진행 상황 업데이트
  updateLoadingProgress(statusText, forceProgress = null) {
    if (forceProgress !== null) {
      this.loadingProgress = forceProgress;
    } else {
      this.loadingProgress += Math.floor(100 / this.totalLoadingSteps);
    }

    const progress = document.getElementById("progress");
    const status = document.getElementById("loadingStatus");

    if (progress) {
      progress.style.width = `${this.loadingProgress}%`;
    }

    if (status) {
      status.textContent = statusText;
    }
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

  // 게임 UI 생성
  createGameUI() {
    // 디버그 정보 표시
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

    // 속도계 개선
    const speedometer = document.getElementById("speedometer");
    if (speedometer) {
      speedometer.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      speedometer.style.color = "white";
      speedometer.style.padding = "10px";
      speedometer.style.borderRadius = "5px";
      speedometer.style.fontFamily = "Arial, sans-serif";
      speedometer.style.fontWeight = "bold";
      speedometer.style.fontSize = "18px";
      speedometer.style.textAlign = "center";
      speedometer.style.width = "150px";
    }

    // 컨트롤 안내
    const controlsInfo = document.createElement("div");
    controlsInfo.id = "controlsInfo";
    controlsInfo.style.position = "absolute";
    controlsInfo.style.bottom = "20px";
    controlsInfo.style.left = "20px";
    controlsInfo.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    controlsInfo.style.color = "white";
    controlsInfo.style.padding = "10px";
    controlsInfo.style.borderRadius = "5px";
    controlsInfo.style.fontFamily = "Arial, sans-serif";
    controlsInfo.style.zIndex = "1000";
    controlsInfo.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">컨트롤:</div>
      <div>W/↑ : 전진</div>
      <div>S/↓ : 후진</div>
      <div>A/← : 좌회전</div>
      <div>D/→ : 우회전</div>
      <div>스페이스바 : 브레이크</div>
      <div>C : 카메라 전환</div>
      <div>O : 자유 시점 카메라 (디버그)</div>
    `;
    document.body.appendChild(controlsInfo);
  }

  // 디버그 정보 업데이트
  updateDebugInfo() {
    if (this.state.debug && this.debugText) {
      const fps = Math.round(1 / this.clock.getDelta());
      this.debugText.innerHTML = `
        <h3>디버그 정보</h3>
        <p>FPS: ${isNaN(fps) ? 0 : fps}</p>
        <p>카메라 모드: ${this.state.camera.mode}</p>
        <p>차량 위치: (${this.state.car.position.x.toFixed(
          2
        )}, ${this.state.car.position.y.toFixed(
        2
      )}, ${this.state.car.position.z.toFixed(2)})</p>
        <p>차량 속도: ${this.state.car.speed.toFixed(2)} km/h</p>
        <p>차량 회전: ${this.state.car.rotation.toFixed(2)}</p>
        <p>카메라 위치: (${this.state.camera.position.x.toFixed(
          2
        )}, ${this.state.camera.position.y.toFixed(
        2
      )}, ${this.state.camera.position.z.toFixed(2)})</p>
        <p>도로 수: ${this.state.roads.length}</p>
        <p>건물 수: ${this.state.buildings.length}</p>
        <p>사용자 위치: ${this.state.userLocation.latitude.toFixed(
          6
        )}, ${this.state.userLocation.longitude.toFixed(6)}</p>
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

  // 애니메이션 루프
  animate() {
    requestAnimationFrame(this.animate.bind(this));

    if (this.state.paused) return;

    // 시간 델타값 얻기
    const deltaTime = Math.min(this.clock.getDelta(), 0.1); // 너무 큰 델타값 방지

    // 게임 시간 업데이트
    this.state.gameTime += deltaTime;

    // 안전장치: 필요한 컴포넌트들이 초기화되었는지 확인
    if (!this.carComponent || !this.state.controls) {
      console.warn("필수 컴포넌트가 아직 초기화되지 않았습니다.");
      return;
    }

    // 자동차 업데이트
    this.carComponent.update(deltaTime);

    // 카메라 모드 확인 및 OrbitControls 처리
    if (this.state.camera.mode === "free" && this.orbitControls) {
      // 자유 모드에서는 OrbitControls 활성화
      if (!this.orbitControls.enabled) {
        this.orbitControls.enabled = true;

        // OrbitControls 타겟 설정 - 차량 위치로
        this.orbitControls.target.set(
          this.state.car.position.x,
          this.state.car.position.y,
          this.state.car.position.z
        );
      }

      // 자동차가 움직이면 OrbitControls 타겟도 자동차 위치로 업데이트
      this.orbitControls.target.set(
        this.state.car.position.x,
        this.state.car.position.y,
        this.state.car.position.z
      );

      // OrbitControls 업데이트
      this.orbitControls.update();
    } else {
      // 다른 모드에서는 OrbitControls 비활성화
      if (this.orbitControls) {
        this.orbitControls.enabled = false;
      }

      // 일반 카메라 업데이트
      this.updateCamera();
    }

    // 게임 로직 업데이트
    this.updateGameLogic(deltaTime);

    // 미니맵 업데이트
    if (this.minimapCanvas) {
      this.updateMinimap(this.minimapCanvas);
    }

    // 속도계 업데이트
    const speedometer = document.getElementById("speedometer");
    if (speedometer) {
      const speed = Math.abs(Math.round(this.state.car.speed));
      speedometer.textContent = `속도: ${speed} km/h`;

      // 속도에 따라 색상 변경
      if (speed > 100) {
        speedometer.style.color = "#ff3333"; // 빨간색 (고속)
      } else if (speed > 50) {
        speedometer.style.color = "#ffcc00"; // 노란색 (중속)
      } else {
        speedometer.style.color = "#ffffff"; // 흰색 (저속)
      }
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

    // 일몰 효과 (시간이 지남에 따라 점차 어두워짐)
    const dayLength = 300; // 게임 내 하루 길이 (초)
    const timeOfDay = (this.state.gameTime % dayLength) / dayLength;

    // 낮과 밤 조절
    if (timeOfDay < 0.25 || timeOfDay > 0.75) {
      // 밤
      const nightIntensity = 0.3;
      this.dirLight.intensity = nightIntensity;
      this.scene.background = new THREE.Color(0x001533); // 어두운 밤하늘
      this.scene.fog.color = new THREE.Color(0x001533);

      // 차량 헤드라이트 켜기
      if (this.carComponent.headlight1 && this.carComponent.headlight2) {
        this.carComponent.headlight1.intensity = 2;
        this.carComponent.headlight2.intensity = 2;
      }
    } else {
      // 낮
      const dayProgress =
        timeOfDay < 0.5
          ? (timeOfDay - 0.25) * 4 // 해 뜨는 시간
          : (0.75 - timeOfDay) * 4; // 해 지는 시간
      const dayIntensity = 0.5 + 0.5 * Math.sin(dayProgress * Math.PI);

      this.dirLight.intensity = dayIntensity;

      // 하늘색 조절
      const skyColor = new THREE.Color().setHSL(
        0.6, // 색조 (파란색)
        0.8, // 채도
        0.5 + 0.3 * dayIntensity // 밝기
      );
      this.scene.background = skyColor;
      this.scene.fog.color = skyColor;

      // 차량 헤드라이트 끄기
      if (this.carComponent.headlight1 && this.carComponent.headlight2) {
        this.carComponent.headlight1.intensity = 0;
        this.carComponent.headlight2.intensity = 0;
      }
    }
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
    minimapContainer.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    minimapContainer.style.borderRadius = "5px";
    minimapContainer.style.border = "2px solid white";
    minimapContainer.style.overflow = "hidden";

    const minimapCanvas = document.createElement("canvas");
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;

    minimapContainer.appendChild(minimapCanvas);
    document.body.appendChild(minimapContainer);

    // 미니맵 제목 추가
    const minimapTitle = document.createElement("div");
    minimapTitle.style.position = "absolute";
    minimapTitle.style.top = "0";
    minimapTitle.style.left = "0";
    minimapTitle.style.width = "100%";
    minimapTitle.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    minimapTitle.style.color = "white";
    minimapTitle.style.textAlign = "center";
    minimapTitle.style.padding = "2px 0";
    minimapTitle.style.fontSize = "12px";
    minimapTitle.style.fontWeight = "bold";
    minimapTitle.textContent = "미니맵";
    minimapContainer.appendChild(minimapTitle);

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
    this.state.buildings.forEach((building) => {
      const x = ((building.position.x / 100) * width) / 2 + width / 2;
      const z = ((building.position.z / 100) * height) / 2 + height / 2;
      const size = (building.width / 100) * width;

      // 건물 높이에 따라 색상 변경
      const heightFactor = Math.min(building.height / 50, 1);
      const r = Math.floor(100 + heightFactor * 155);
      const g = Math.floor(100 + heightFactor * 100);
      const b = Math.floor(100 + heightFactor * 100);

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
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

    // 시야 범위 표시 (속도에 따라 변화)
    const viewDistance = Math.abs(this.state.car.speed) / 10 + 5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, viewDistance, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();

    ctx.restore();
  }

  // 사운드 초기화
  initSounds() {
    // 사운드 초기화 코드
    // 나중에 필요한 사운드들을 여기에 추가
    console.log("사운드 시스템 초기화");

    // Web Audio API를 사용한 엔진 사운드 구현
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const audioContext = new AudioContext();

        // 엔진 사운드를 위한 오실레이터 설정
        const engineOscillator = audioContext.createOscillator();
        engineOscillator.type = "sawtooth";
        engineOscillator.frequency.value = 50; // 초기 주파수

        // 게인 노드 (볼륨 조절용)
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.05; // 초기 볼륨 (낮게 설정)

        // 필터 추가 (엔진 사운드 조절)
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 200;

        // 연결
        engineOscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // 오실레이터 시작
        engineOscillator.start();

        // 상태에 저장
        this.state.sounds.engine = {
          oscillator: engineOscillator,
          gainNode: gainNode,
          filter: filter,
          context: audioContext,
        };

        // 엔진 사운드 업데이트 함수
        this.updateEngineSound = (speed) => {
          if (this.state.sounds.engine) {
            const absSpeed = Math.abs(speed);
            const freq = 50 + absSpeed * 3; // 속도에 따라 주파수 조절
            const volume = 0.01 + Math.min(absSpeed / 150, 1) * 0.04; // 속도에 따라 볼륨 조절

            // 주파수와 볼륨 업데이트
            this.state.sounds.engine.oscillator.frequency.value = freq;
            this.state.sounds.engine.gainNode.gain.value = volume;

            // 필터 업데이트
            this.state.sounds.engine.filter.frequency.value =
              100 + absSpeed * 5;
          }
        };

        // 다른 사운드 효과 로드
        // 예: 브레이크 소리, 충돌 소리, 경적 소리 등

        console.log("사운드 시스템 초기화 완료");
      }
    } catch (error) {
      console.error("사운드 시스템 초기화 실패:", error);
    }
  }

  // 게임 재시작
  restart() {
    console.log("게임 재시작...");

    // 차량 위치 및 상태 초기화
    this.state.car.speed = 0;
    this.state.car.acceleration = 0;

    // 가까운 도로 찾기 및 차량 배치
    if (this.mapLoader) {
      this.mapLoader.setVehicleStartPosition();
    }

    // 카메라 초기화
    this.state.camera.mode = "follow";

    // 점수 초기화
    this.state.score = 0;

    console.log("게임 재시작 완료");
  }

  // 게임 일시정지/재개
  togglePause() {
    this.state.paused = !this.state.paused;

    if (this.state.paused) {
      // 일시정지 UI 표시
      const pauseScreen = document.createElement("div");
      pauseScreen.id = "pauseScreen";
      pauseScreen.style.position = "absolute";
      pauseScreen.style.top = "0";
      pauseScreen.style.left = "0";
      pauseScreen.style.width = "100%";
      pauseScreen.style.height = "100%";
      pauseScreen.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      pauseScreen.style.color = "white";
      pauseScreen.style.display = "flex";
      pauseScreen.style.flexDirection = "column";
      pauseScreen.style.justifyContent = "center";
      pauseScreen.style.alignItems = "center";
      pauseScreen.style.fontSize = "24px";
      pauseScreen.style.zIndex = "1000";

      pauseScreen.innerHTML = `
        <h1>일시정지</h1>
        <p>계속하려면 ESC 키를 누르세요</p>
      `;

      document.body.appendChild(pauseScreen);

      // 엔진 사운드 중지
      if (this.state.sounds.engine && this.state.sounds.engine.gainNode) {
        this.state.sounds.engine.gainNode.gain.value = 0;
      }
    } else {
      // 일시정지 UI 제거
      const pauseScreen = document.getElementById("pauseScreen");
      if (pauseScreen) {
        document.body.removeChild(pauseScreen);
      }

      // 엔진 사운드 재개
      if (this.state.sounds.engine) {
        this.updateEngineSound(this.state.car.speed);
      }
    }
  }
}
