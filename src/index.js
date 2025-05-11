import * as THREE from "three";
import { Game } from "./game/Game";
import "mapbox-gl/dist/mapbox-gl.css";

// 게임 인스턴스 생성 및 시작
const game = new Game();
game
  .init()
  .then(() => {
    console.log("게임 초기화 완료");
  })
  .catch((error) => {
    console.error("게임 초기화 중 오류 발생:", error);
  });
